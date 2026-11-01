const axios = require('axios');
const { SYSTEM_INSTRUCTION, projectGuideReply, cleanHistory } = require('./assistantGuide');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 60000;

function cleanSecret(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
}

function normaliseModel(value) {
  return String(value || DEFAULT_MODEL).trim().replace(/^models\//, '');
}

function apiHeaders(apiKey) {
  return { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
}

function modelUrl(model) {
  return `${API_BASE}/models/${encodeURIComponent(normaliseModel(model))}:generateContent`;
}

function responseText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
}

async function probeGeminiModel({ apiKey, model }) {
  const { data } = await axios.post(modelUrl(model), {
    contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
    generationConfig: { maxOutputTokens: 32, temperature: 0 },
  }, { headers: apiHeaders(apiKey), timeout: 20000 });
  if (!responseText(data)) {
    throw Object.assign(new Error('Gemini returned no text for the test prompt.'), { code: 'GEMINI_EMPTY' });
  }
  return true;
}

async function listGeminiModels(apiKey) {
  const { data } = await axios.get(`${API_BASE}/models`, {
    headers: apiHeaders(apiKey),
    params: { pageSize: 1000 },
    timeout: 20000,
  });
  return (data.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => normaliseModel(model.name))
    .filter(Boolean);
}

function modelCandidates(models) {
  return [...new Set(models)].sort((a, b) => {
    const priority = (name) => {
      if (/image|embedding/i.test(name)) return 3;
      if (/flash/i.test(name) && !/preview|exp/i.test(name)) return 0;
      if (/flash/i.test(name)) return 1;
      return 2;
    };
    return priority(a) - priority(b) || a.localeCompare(b);
  }).slice(0, 5);
}

function failureHint(status, code) {
  if (status === 400) return 'The request was rejected. Check the model name and API request limits.';
  if (status === 401 || status === 403) return 'Gemini rejected the API key or the Gemini API is not enabled for its Google project.';
  if (status === 404) return 'That model is unavailable to this API key. Run `node scripts/test-gemini.js` to find a working model.';
  if (status === 429) return 'The model quota or rate limit was reached. Check the active limits in Google AI Studio and retry later.';
  if (status) return `Gemini returned HTTP ${status}. Check the model, API key, and account limits.`;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'Gemini did not answer before the timeout. Check your internet connection and retry.';
  return 'Check GEMINI_API_KEY, GEMINI_MODEL, and the backend connection.';
}

async function generateAssistantReply({ message, history = [] }) {
  const userMessage = String(message ?? '').slice(0, 2000);
  const guideReply = projectGuideReply(userMessage);
  const apiKey = cleanSecret(process.env.GEMINI_API_KEY);
  const model = normaliseModel(process.env.GEMINI_MODEL);

  if (!apiKey) {
    if (guideReply) return { reply: guideReply, source: 'guide' };
    throw Object.assign(new Error('Gemini is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.'), { status: 503 });
  }

  const turns = cleanHistory(history).map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: [{ text: content }],
  }));
  turns.push({ role: 'user', parts: [{ text: userMessage }] });

  try {
    const { data } = await axios.post(modelUrl(model), {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: turns,
      generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
    }, { headers: apiHeaders(apiKey), timeout: REQUEST_TIMEOUT_MS });
    const reply = responseText(data);
    if (!reply) throw Object.assign(new Error('Gemini returned no text.'), { code: 'GEMINI_EMPTY' });
    return { reply, source: 'gemini' };
  } catch (error) {
    const status = error.response?.status;
    const hint = failureHint(status, error.code);
    const detail = String(error.response?.data?.error?.message || '')
      .replaceAll(apiKey, '[redacted]')
      .slice(0, 300);
    console.error(`gemini request failed (model: ${model}):`, status || error.code || 'request error', detail);
    if (guideReply) {
      return {
        reply: `Gemini is currently unavailable${status ? ` (HTTP ${status})` : ''}. ${hint}\n\nHere is the built-in Reclaim Value guide:\n\n${guideReply}`,
        source: 'guide',
      };
    }
    throw Object.assign(new Error(`Gemini is unavailable. ${hint}`), { status: 502 });
  }
}

module.exports = {
  generateAssistantReply,
  listGeminiModels,
  modelCandidates,
  normaliseModel,
  probeGeminiModel,
};
