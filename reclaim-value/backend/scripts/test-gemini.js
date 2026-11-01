require('dotenv').config();
const {
  listGeminiModels,
  modelCandidates,
  normaliseModel,
  probeGeminiModel,
} = require('../src/gemini');

async function main() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing. Add it to backend/.env; the key will not be displayed.');
    process.exitCode = 1;
    return;
  }

  const requestedModel = process.argv[2];
  let candidates;
  if (requestedModel) {
    candidates = [normaliseModel(requestedModel)];
  } else {
    try {
      const available = await listGeminiModels(apiKey);
      const configured = process.env.GEMINI_MODEL ? normaliseModel(process.env.GEMINI_MODEL) : '';
      candidates = [...new Set([configured, ...modelCandidates(available)].filter(Boolean))].slice(0, 5);
      console.log(`Models to test: ${candidates.join(', ') || '(none)'}`);
    } catch (error) {
      const status = error.response?.status;
      console.error(`Could not list Gemini models${status ? ` (HTTP ${status})` : ''}. Check GEMINI_API_KEY and Gemini API access.`);
      process.exitCode = 1;
      return;
    }
  }

  if (!candidates.length) {
    console.error('No Gemini models supporting generateContent were returned for this API key.');
    process.exitCode = 1;
    return;
  }

  for (const model of candidates) {
    try {
      await probeGeminiModel({ apiKey, model });
      console.log(`WORKS: ${model}`);
      console.log(`Set GEMINI_MODEL=${model} in backend/.env, then restart the backend.`);
      return;
    } catch (error) {
      const status = error.response?.status;
      const message = String(error.response?.data?.error?.message || error.message || '')
        .replaceAll(apiKey, '[redacted]')
        .replace(/Bearer\s+[0-9A-Za-z._-]{10,}/gi, '[redacted]')
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      console.log(`Unavailable: ${model}${status ? ` (HTTP ${status})` : ` (${error.code || 'request error'})`}${message ? ` — ${message}` : ''}`);
      if (status === 401 || status === 403) break;
    }
  }

  console.error('No tested model generated a reply. For HTTP 429, check the project/model quota in Google AI Studio; for HTTP 404, choose a model shown as available for your API key.');
  console.error('Google AI Studio rate limits: https://aistudio.google.com/rate-limit');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Gemini model check failed (${error.code || 'unexpected error'}).`);
  process.exitCode = 1;
});
