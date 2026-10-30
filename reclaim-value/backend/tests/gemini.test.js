jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { generateAssistantReply, projectGuideReply } = require('../src/gemini');

describe('Gemini assistant', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalChatProvider = process.env.CHAT_PROVIDER;
  const originalHfToken = process.env.HF_TOKEN;
  const originalHfModel = process.env.HF_MODEL;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalChatProvider === undefined) delete process.env.CHAT_PROVIDER;
    else process.env.CHAT_PROVIDER = originalChatProvider;
    if (originalHfToken === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = originalHfToken;
    if (originalHfModel === undefined) delete process.env.HF_MODEL;
    else process.env.HF_MODEL = originalHfModel;
  });

  test('sends a private request with recent chat history and returns model text', async () => {
    process.env.CHAT_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'test-model';
    axios.post.mockResolvedValue({
      data: {
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Hello from Gemini.' }] }],
      },
    });

    const reply = await generateAssistantReply({
      message: 'How does the price estimate work?',
      history: [{ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hi!' }],
    });

    expect(reply).toEqual({ reply: 'Hello from Gemini.', source: 'gemini' });
    expect(axios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        model: 'test-model',
        store: false,
        input: expect.stringContaining('User: Hello\nAssistant: Hi!\nUser: How does the price estimate work?'),
      }),
      expect.objectContaining({ headers: { 'x-goog-api-key': 'test-key' }, timeout: 60000 }),
    );
  });

  test('returns a setup error when API key is missing', async () => {
    process.env.CHAT_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    const result = await generateAssistantReply({ message: 'How does the price estimate work?' });
    expect(result.source).toBe('guide');
    expect(result.reply).toContain('baseline formula');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('uses the project guide when Gemini is unreachable for a known topic', async () => {
    process.env.CHAT_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    axios.post.mockRejectedValue({ code: 'ECONNABORTED' });

    const result = await generateAssistantReply({ message: 'How does the marketplace work?' });

    expect(result.source).toBe('guide');
    expect(result.reply).toContain('Gemini is currently unavailable');
    expect(result.reply).toContain('purchase request');
  });

  test('returns an explicit setup error for an unknown question without a key', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generateAssistantReply({ message: 'Explain quantum entanglement' })).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('GEMINI_API_KEY'),
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('surfaces provider failures as an explicit service error', async () => {
    process.env.CHAT_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    axios.post.mockRejectedValue({ response: { status: 401 } });

    await expect(generateAssistantReply({ message: 'Explain quantum entanglement' })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Gemini is unavailable'),
    });
  });

  test('explains temporary Gemini model overloads', async () => {
    process.env.CHAT_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    axios.post.mockRejectedValue({ response: { status: 503 } });

    await expect(generateAssistantReply({ message: 'Explain quantum entanglement' })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Gemini is temporarily overloaded'),
    });
  });

  test('project guide has answers for main product areas', () => {
    expect(projectGuideReply('How do I scan a photo?')).toContain('YOLO');
    expect(projectGuideReply('What are CO2 savings?')).toContain('fixed factor');
    expect(projectGuideReply('How do buyers purchase?')).toContain('purchase request');
    expect(projectGuideReply('Tell me a joke')).toBeNull();
  });

  test('uses Hugging Face when selected and returns its chat completion', async () => {
    process.env.CHAT_PROVIDER = 'huggingface';
    process.env.HF_TOKEN = 'hf-test-key';
    process.env.HF_MODEL = 'google/gemma-2-2b-it';
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Here is a helpful answer.' } }] },
    });

    const result = await generateAssistantReply({
      message: 'Tell me something about reclaimed materials',
      history: [{ role: 'assistant', text: 'Hello.' }],
    });

    expect(result).toEqual({ reply: 'Here is a helpful answer.', source: 'huggingface' });
    expect(axios.post).toHaveBeenCalledWith(
      'https://router.huggingface.co/v1/chat/completions',
      expect.objectContaining({
        model: 'google/gemma-2-2b-it',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: 'Hello.' }),
          expect.objectContaining({ role: 'user', content: 'Tell me something about reclaimed materials' }),
        ]),
      }),
      expect.objectContaining({ headers: { Authorization: 'Bearer hf-test-key' } }),
    );
  });

  test('returns the built-in guide if Hugging Face is unavailable for app help', async () => {
    process.env.CHAT_PROVIDER = 'huggingface';
    process.env.HF_TOKEN = 'hf-test-key';
    axios.post.mockRejectedValue({ response: { status: 503 } });

    const result = await generateAssistantReply({ message: 'How does the marketplace work?' });

    expect(result.source).toBe('guide');
    expect(result.reply).toContain('Hugging Face is currently unavailable (HTTP 503)');
    expect(result.reply).toContain('purchase request');
  });

  test('explains Hugging Face 403 permission errors without exposing token', async () => {
    process.env.CHAT_PROVIDER = 'huggingface';
    process.env.HF_TOKEN = 'hf-test-key';
    axios.post.mockRejectedValue({ response: { status: 403 } });

    const result = await generateAssistantReply({ message: 'How does the marketplace work?' });

    expect(result.source).toBe('guide');
    expect(result.reply).toContain('HTTP 403');
    expect(result.reply).toContain('Inference Providers permission');
    expect(result.reply).not.toContain('hf-test-key');
  });

  test('explains Hugging Face 402 exhausted inference credits', async () => {
    process.env.CHAT_PROVIDER = 'huggingface';
    process.env.HF_TOKEN = 'hf-test-key';
    axios.post.mockRejectedValue({ response: { status: 402 } });

    await expect(generateAssistantReply({ message: 'Explain quantum entanglement' })).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('no remaining Inference Providers credits'),
    });
  });
});
