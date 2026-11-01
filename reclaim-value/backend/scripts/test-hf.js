#!/usr/bin/env node
/* Diagnose a Hugging Face Inference Providers setup, independent of the app.
 *   cd backend && node scripts/test-hf.js
 *   node scripts/test-hf.js --model Qwen/Qwen3-4B-Instruct-2507
 *   node scripts/test-hf.js --list gpt-oss        (list model ids containing "gpt-oss")
 *   node scripts/test-hf.js --env .env            (default)
 * Never prints your token. Reads it from the same .env your backend uses. */
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const envFile = opt('--env', '.env');
if (fs.existsSync(envFile)) {
  try { process.loadEnvFile(envFile); console.log(`loaded ${envFile}`); }
  catch (e) { console.log(`! could not parse ${envFile}: ${e.message}`); }
} else console.log(`(no ${envFile} in ${process.cwd()}; using the shell environment only)`);

const NAMES = ['HF_TOKEN', 'HUGGINGFACE_HUB_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'HUGGINGFACE_API_KEY', 'HF_API_KEY', 'HUGGINGFACE_TOKEN'];
const found = NAMES.filter((n) => process.env[n]);
if (!found.length) {
  console.log(`\nFAIL: no token found. Looked for: ${NAMES.join(', ')}.\nIf your backend uses another variable name, run:  HF_TOKEN=<that value> node scripts/test-hf.js`);
  process.exit(1);
}
const name = found[0], raw = process.env[name];
const token = raw.trim();
console.log(`\ntoken variable: ${name}  (length ${raw.length})`);
const warn = [];
if (raw !== token) warn.push('has leading/trailing whitespace or a Windows line ending (\\r). Remove it from .env');
if (/^["']|["']$/.test(token)) warn.push('is wrapped in quotes that your loader may keep. Remove the quotes');
if (/^bearer\s/i.test(token)) warn.push('starts with "Bearer ". Put only the hf_... value in .env');
if (!token.startsWith('hf_')) warn.push('does not start with "hf_" (Hugging Face tokens do)');
if (found.length > 1) warn.push(`several token variables are set (${found.join(', ')}); make sure your code reads the one you mean`);
warn.forEach((w) => console.log(`  WARNING: ${w}`));
const tok = token.replace(/^["']|["']$/g, '').replace(/^bearer\s+/i, '');

const BASE = (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '');
const WHOAMI = process.env.HF_WHOAMI_URL || 'https://huggingface.co/api/whoami-v2';
const MODEL = opt('--model', process.env.HF_MODEL || 'Qwen/Qwen3-4B-Instruct-2507');
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

async function call(url, init = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: ctrl.signal });
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, text, json };
  } catch (e) { return { status: 0, text: String(e.cause?.code || e.message) }; }
  finally { clearTimeout(t); }
}
const excerpt = (s) => String(s).replace(/hf_[A-Za-z0-9]+/g, 'hf_***').slice(0, 300);

function advise(status, text) {
  const t = text.toLowerCase();
  switch (status) {
    case 0: return 'No response. Check internet/proxy/firewall, and that router.huggingface.co is reachable from this machine.';
    case 401: return 'The token is invalid, expired or revoked (or mangled by .env formatting). Create a new token and replace it.';
    case 403: return [
      '403 = Hugging Face recognised you but refused the call. In order of likelihood:',
      '  1. A fine-grained token WITHOUT the permission "Make calls to Inference Providers". Create a new fine-grained token at',
      '     huggingface.co/settings/tokens, tick that permission, and use it. (A token that can download models is not enough.)',
      '  2. Your running backend is using a different/older token than this one, e.g. an old node process still holding',
      '     port 5000 with the previous environment (EADDRINUSE). Kill it, restart, and retest in the app.',
      '  3. The model is gated: open its page on huggingface.co and accept the terms, or pick an ungated model.',
      '  4. An organisation billing/provider restriction applies to this token.'].join('\n');
    case 402: return 'Payment required: your Inference Providers credits are used up. Add credits or wait for the monthly reset.';
    case 404: return `Model "${MODEL}" not found or not served by any provider you can use. List valid ids:  node scripts/test-hf.js --list <word>`;
    case 429: return 'Rate limited or quota hit. Wait and retry, or use a different provider suffix (e.g. :cheapest).';
    default: return status >= 500 ? 'Provider-side error. Retry; or try another provider with a suffix like :fastest.' :
      (t.includes('model') ? 'Check the model id.' : 'Unexpected response; see the body above.');
  }
}

(async () => {
  const listIdx = args.indexOf('--list');
  if (listIdx >= 0) {
    const filter = (args[listIdx + 1] && !args[listIdx + 1].startsWith('--')) ? args[listIdx + 1].toLowerCase() : '';
    const r = await call(`${BASE}/models`);
    if (r.status !== 200) { console.log(`GET /models -> ${r.status}\n${advise(r.status, r.text)}`); process.exit(1); }
    const ids = (r.json?.data || []).map((m) => m.id).filter((id) => id.toLowerCase().includes(filter));
    console.log(ids.slice(0, 60).join('\n') + (ids.length > 60 ? `\n... ${ids.length - 60} more` : '')); process.exit(0);
  }

  const who = await call(WHOAMI);
  if (who.status === 200 && who.json) {
    const a = who.json.auth?.accessToken || {};
    console.log(`\n1) whoami: signed in as "${who.json.name}"; token role: ${a.role || 'unknown'}`);
    const scoped = a.fineGrained?.scoped;
    if (scoped) {
      const perms = [...new Set(scoped.flatMap((s) => s.permissions || []))];
      console.log(`   fine-grained permissions: ${perms.join(', ') || '(none)'}`);
      if (!perms.some((p) => /infer/i.test(p))) console.log('   -> no inference-related permission listed: this is very likely your 403.');
    }
  } else console.log(`\n1) whoami: skipped (${who.status || 'no response'}); not conclusive`);

  const models = await call(`${BASE}/models`);
  console.log(`2) GET /models -> ${models.status}  (a 200 here does NOT prove chat is allowed)`);

  const chat = await call(`${BASE}/chat/completions`, { method: 'POST', body: JSON.stringify({
    model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] }) });
  console.log(`3) POST /chat/completions model=${MODEL} -> ${chat.status}`);
  if (chat.status === 200) {
    const m = chat.json?.choices?.[0]?.message || {};
    console.log(`   reply: ${JSON.stringify(m.content ?? '(empty; reasoning model used its tokens thinking)')}`);
    if (warn.length) {
      console.log('\nPASS, but only because this script cleaned the token first. Your app may send it as-is: fix the WARNING lines above.');
      process.exit(2);
    }
    console.log('\nPASS: this token can call Inference Providers. If your app still shows 403, the app is not using this token' +
      ' (stale process on port 5000, or it reads a different variable name).');
    process.exit(0);
  }
  console.log(`   body: ${excerpt(chat.text)}`);
  console.log(`\nFAIL (${chat.status}): ${advise(chat.status, chat.text)}`);
  process.exit(1);
})();
