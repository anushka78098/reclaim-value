const axios = require('axios');
const { SYSTEM_INSTRUCTION, projectGuideReply, cleanHistory } = require('./assistantGuide');
const MAX_CHARS = 2000;

// Never let a token reach logs or error text.
function redact(text) {
  return String(text ?? '')
    .replace(/hf_[0-9A-Za-z]{10,}/g, '[redacted]')
    .replace(/Bearer\s+[0-9A-Za-z._-]{10,}/gi, 'Bearer [redacted]');
}

// Hugging Face puts the useful explanation in the error body, e.g. "model is not supported by any provider you have enabled".
function providerDetail(error) {
  const d = error.response?.data;
  const msg = d?.error?.message || (typeof d?.error === 'string' ? d.error : '') || d?.message || '';
  return redact(msg).slice(0, 300);
}

function providerFailureHint(status, code) {
  switch (status) {
    case 400: return 'Hugging Face rejected the request, usually because the model id is not served by the Inference Providers you have enabled. Set HF_MODEL to an id from: node scripts/test-hf.js --list';
    case 401: return 'The token was rejected. Create a new token and verify it is copied correctly into HF_TOKEN.';
    case 402: return 'Your Hugging Face token is valid, but the account has no remaining Inference Providers credits. Add prepaid credits or wait for the monthly reset.';
    case 403: return 'Hugging Face denied access. Use a fine-grained token with "Make calls to Inference Providers" enabled, and accept the terms of any gated model.';
    case 404: return 'Hugging Face does not serve that model id. Set HF_MODEL to an id from: node scripts/test-hf.js --list';
    case 429: return 'The Hugging Face rate limit or credit quota was reached. Wait and retry, or check your account limits.';
    case 503: return 'The selected provider/model is temporarily unavailable. Try again shortly or choose another model.';
    default:
  }
  if (status) return `Hugging Face returned HTTP ${status}. Check the token permissions, model access, and account limits.`;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return 'Hugging Face did not answer within the time limit (default 60 s; set HF_TIMEOUT_MS to change). Check your internet, VPN or proxy, then retry.';
  }
  return 'Check HF_TOKEN, HF_MODEL, your internet connection, and the backend log.';
}

/* ---------- Hugging Face Inference Providers (OpenAI-compatible router) ---------- */
const DEFAULT_MODEL = 'Qwen/Qwen3-4B-Instruct-2507';
// Used only if the configured model is not served: first one the router lists wins. Instruct models first, because
// reasoning models can spend their whole token budget thinking and return an empty answer.
const PREFERRED_MODELS = [
  'Qwen/Qwen3-4B-Instruct-2507',
  'meta-llama/Llama-3.3-70B-Instruct',
  'Qwen/Qwen3-235B-A22B-Instruct-2507',
  'meta-llama/Llama-3.1-8B-Instruct',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

const hfBase = () => (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '');
const hfTimeout = () => Number(process.env.HF_TIMEOUT_MS) || 60000;
const hfMaxTokens = () => Number(process.env.HF_MAX_TOKENS) || 1000;

// A value pasted into .env often carries quotes, spaces or a "Bearer " prefix.
function cleanSecret(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '').trim().replace(/^bearer\s+/i, '');
}
function normaliseModel(id) {
  return String(id || '').trim().replace(/^["']|["']$/g, '').trim();
}
// Some models put their reasoning inline in <think>...</think>; users should only see the answer.
function stripThinking(text) {
  return String(text || '').replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
}

async function withRetryOn503(fn) {
  try { return await fn(); } catch (error) {
    if (error.response?.status !== 503) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fn();
  }
}

async function requestHuggingFace({ apiKey, model, messages }) {
  const response = await withRetryOn503(() => axios.post(
    `${hfBase()}/chat/completions`,
    { model, messages, max_tokens: hfMaxTokens(), temperature: 0.4, stream: false },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: hfTimeout() },
  ));
  const choice = response.data.choices?.[0];
  const text = stripThinking(choice?.message?.content);
  if (!text) {
    const spentThinking = choice?.message?.reasoning || choice?.message?.reasoning_content;
    throw new Error(`Hugging Face returned an empty response${choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''}${
      spentThinking ? '. The model used its tokens reasoning: raise HF_MAX_TOKENS or choose a non-reasoning model' : ''}`);
  }
  return text;
}

// "Model not served" arrives as 404, or as 400 with a model_* code, depending on the provider.
function isModelNotServed(error) {
  const status = error.response?.status;
  if (status === 404) return true;
  const code = String(error.response?.data?.error?.code || '');
  return status === 400 && (/model/i.test(code) || /not supported by any provider|model.*not (found|supported)/i.test(providerDetail(error)));
}

async function discoverHfModel({ apiKey }) {
  const { data } = await axios.get(`${hfBase()}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000,
  });
  const ids = new Set((data.data || []).map((m) => m.id));
  return PREFERRED_MODELS.find((id) => ids.has(id)) || null;
}

const resolvedModels = new Map(); // configured id -> id that actually worked

async function requestWithRecovery({ apiKey, model, messages }) {
  const first = resolvedModels.get(model) || model;
  try {
    return await requestHuggingFace({ apiKey, model: first, messages });
  } catch (error) {
    if (!isModelNotServed(error)) throw error;
    let alternative = null;
    try { alternative = await discoverHfModel({ apiKey }); } catch { /* listing failed: report the original error */ }
    if (!alternative || alternative === first) throw error;
    const text = await requestHuggingFace({ apiKey, model: alternative, messages });
    resolvedModels.set(model, alternative);
    console.error(`huggingface: model "${model}" is not served for this account; using "${alternative}" instead. Set HF_MODEL=${alternative} in backend/.env.`);
    return text;
  }
}

/* ---------- entry point ---------- */
// Printed once, on the first chat request (by then .env has been loaded). Shows WHICH file is running and what
// settings it really sees: settles "wrong copy of the project" and "a shell variable overrides .env".
let announced = false;
function announce(model, apiKey) {
  if (announced) return;
  announced = true;
  console.log(`[chat] running: ${__filename}`);
  console.log(`[chat] provider=huggingface  model=${model}  token=${apiKey ? `set (${apiKey.length} chars${apiKey.startsWith('hf_') ? '' : ', does not start with hf_'})` : 'MISSING'}  timeout=${hfTimeout()}ms`);
}

async function generateAssistantReply({ message, history = [] }) {
  const userMessage = String(message ?? '').slice(0, MAX_CHARS);
  const guideReply = projectGuideReply(userMessage);
  const apiKey = cleanSecret(process.env.HF_TOKEN);
  const model = normaliseModel(process.env.HF_MODEL) || DEFAULT_MODEL;
  announce(model, apiKey);

  if (!apiKey) {
    if (guideReply) return { reply: guideReply, source: 'guide' };
    throw Object.assign(new Error('Hugging Face is not configured. Add HF_TOKEN to backend/.env and restart the backend.'), { status: 503 });
  }

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...cleanHistory(history),
    { role: 'user', content: userMessage },
  ];

  try {
    const reply = await requestWithRecovery({ apiKey, model, messages });
    return { reply, source: 'huggingface' };
  } catch (error) {
    const status = error.response?.status;
    const detail = providerDetail(error);
    const where = redact(String(error.config?.url || '').replace(/^https?:\/\/[^/]+/, ''));
    console.error(`huggingface request failed (model: ${model}):`, status || error.code || redact(error.message), where ? `at ${where}` : '', detail ? `- ${detail}` : '');
    const hint = providerFailureHint(status, error.code);
    if (guideReply) {
      return {
        reply: `Hugging Face is currently unavailable${status ? ` (HTTP ${status})` : ''}. ${hint}\n\nHere is the built-in Reclaim Value guide:\n\n${guideReply}`,
        source: 'guide',
      };
    }
    throw Object.assign(new Error(`Hugging Face is unavailable. ${hint}`), { status: 502 });
  }
}

module.exports = { generateAssistantReply, projectGuideReply, cleanHistory, redact, normaliseModel, stripThinking };
