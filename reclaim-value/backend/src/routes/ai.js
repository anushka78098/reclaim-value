const r = require('express').Router(); const axios = require('axios'); const FormData = require('form-data'); const multer = require('multer');
const { auth, requireRole, wrap } = require('../middleware'); const { Material } = require('../models');
const { createListing } = require('./listings'); const { saveImage } = require('../storage');
const { generateAssistantReply } = require('../gemini');
const { getAssistantIntent } = require('../assistantIntent');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
r.use(auth);

// Modules 1+2: image -> detection + recommendation + price
r.post('/analyze', requireRole('Company'), upload.single('image'), wrap(async (req, res) => {
  if (!req.file || !/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Upload an image file (field "image")' });
  const fd = new FormData(); fd.append('image', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
  let ai; try { ai = (await axios.post(`${process.env.AI_URL}/analyze`, fd, { headers: fd.getHeaders(), timeout: 60000 })).data; }
  catch { return res.status(502).json({ error: 'AI service unavailable' }); }
  res.json({ ...ai, imageUrl: await saveImage(req.file) });
}));

// Agent tools executed against the DB (function calling)
const tools = {
  async list_inventory(user, { status }) {
    const ms = await Material.find({ ownerId: user._id, ...(status ? { status } : {}) }).sort('-estimatedValue');
    return { reply: ms.length ? ms.map((m) => `${m.materialType} ${m.quantity}kg (Grade ${m.conditionScore}) – ₹${m.estimatedValue} [${m.status}]`).join('\n') : 'Your inventory is empty.', data: ms };
  },
  async create_listing(user, { select }) {
    const pool = await Material.find({ ownerId: user._id, status: 'Available' }).sort(select === 'highest_value' ? '-estimatedValue' : '-createdAt').limit(1);
    if (!pool.length) return { reply: 'No unlisted material is available to list.' };
    const l = await createListing(user, { materialId: pool[0]._id });
    return { reply: `Listed ${pool[0].materialType} (${pool[0].quantity}kg) at ₹${l.price}.`, data: l };
  },
  async get_summary(user) {
    const ms = await Material.find({ ownerId: user._id });
    const val = ms.reduce((s, m) => s + (m.estimatedValue || 0), 0);
    return { reply: `${ms.length} items, ${ms.reduce((s, m) => s + m.quantity, 0)} kg, total estimated value ₹${val}.` };
  },
};
r.post('/agent', requireRole('Company'), wrap(async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const safeHistory = history.slice(-10).filter((entry) =>
    entry && ['user', 'assistant'].includes(entry.role) && typeof entry.text === 'string',
  ).map((entry) => ({ role: entry.role, text: entry.text.slice(0, 1000) }));

  const intent = getAssistantIntent(message);
  if (!intent) return res.json(await generateAssistantReply({ message, history: safeHistory }));
  res.json({ source: 'action', tool: intent.tool, ...(await tools[intent.tool](req.user, intent.args)) });
}));
module.exports = r;
