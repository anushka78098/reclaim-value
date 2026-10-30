const r = require('express').Router(); const { Material } = require('../models'); const { auth, requireRole, wrap } = require('../middleware');
r.use(auth, requireRole('Company', 'Admin'));
const own = (req) => (req.user.role === 'Admin' ? {} : { ownerId: req.user._id });

r.post('/', wrap(async (req, res) => {
  const { materialType, conditionScore, quantity, estimatedValue, images, siteName, recommendation, storageCostPerDay } = req.body;
  if (!materialType || !quantity) return res.status(400).json({ error: 'materialType and quantity required' });
  res.status(201).json(await Material.create({ ownerId: req.user._id, materialType, conditionScore, quantity, estimatedValue, images, siteName, recommendation, storageCostPerDay }));
}));
r.get('/', wrap(async (req, res) => {
  const q = { ...own(req), ...(req.query.status ? { status: req.query.status } : {}) };
  res.json(await Material.find(q).sort('-createdAt'));
}));
r.get('/:id', wrap(async (req, res) => {
  const m = await Material.findOne({ _id: req.params.id, ...own(req) });
  m ? res.json(m) : res.status(404).json({ error: 'Not found' });
}));
r.put('/:id', wrap(async (req, res) => {
  const { ownerId, ...patch } = req.body;
  const m = await Material.findOneAndUpdate({ _id: req.params.id, ...own(req) }, patch, { new: true, runValidators: true });
  m ? res.json(m) : res.status(404).json({ error: 'Not found' });
}));
r.delete('/:id', wrap(async (req, res) => {
  const m = await Material.findOneAndDelete({ _id: req.params.id, ...own(req), status: { $ne: 'Listed' } });
  m ? res.json({ deleted: true }) : res.status(404).json({ error: 'Not found or currently listed' });
}));
module.exports = r;
