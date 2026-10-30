const r = require('express').Router(); const { User, Listing, Material } = require('../models'); const { auth, requireRole, wrap } = require('../middleware');
r.use(auth, requireRole('Admin'));
r.get('/users', wrap(async (_q, res) => res.json(await User.find().select('-passwordHash').sort('-createdAt'))));
r.patch('/users/:id', wrap(async (req, res) => {
  const { verified, suspended } = req.body;
  res.json(await User.findByIdAndUpdate(req.params.id, { ...(verified !== undefined && { verified }), ...(suspended !== undefined && { suspended }) }, { new: true }).select('-passwordHash'));
}));
r.delete('/listings/:id', wrap(async (req, res) => { // moderation
  const l = await Listing.findByIdAndUpdate(req.params.id, { status: 'Removed' });
  if (l) await Material.findByIdAndUpdate(l.materialId, { status: 'Available' });
  res.json({ removed: !!l });
}));
r.post('/retrain', (_q, res) => res.json({ queued: true, note: 'Run ai-service/train_price.py with exported trades.' }));
module.exports = r;
