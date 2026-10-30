const r = require('express').Router(); const axios = require('axios');
const { Listing, Material } = require('../models'); const { auth, requireRole, wrap } = require('../middleware');
const { haversineKm, matchScore, similarity } = require('../utils');

async function createListing(user, { materialId, price, askingQty }) {
  const m = await Material.findOne({ _id: materialId, ownerId: user._id });
  if (!m) throw Object.assign(new Error('Material not found'), { status: 404 });
  if (m.status === 'Listed') throw Object.assign(new Error('Already listed'), { status: 409 });
  const l = await Listing.create({ materialId: m._id, sellerId: user._id, price: price ?? m.estimatedValue, askingQty: askingQty ?? m.quantity });
  m.status = 'Listed'; await m.save();
  return l;
}

r.post('/', auth, requireRole('Company'), wrap(async (req, res) => res.status(201).json(await createListing(req.user, req.body))));

// GET /api/listings?q=&material=&condition=A,B&maxPrice=&maxKm=&nl=natural language text
r.get('/', auth, wrap(async (req, res) => {
  let { q, material, condition, maxPrice, maxKm } = req.query; let parsed = null;
  if (req.query.nl) { // Module 6: natural language -> structured filters via AI service
    try {
      parsed = (await axios.post(`${process.env.AI_URL}/parse-query`, { text: req.query.nl }, { timeout: 5000 })).data.filters;
      material = parsed.material || material; q = q || req.query.nl;
      if (parsed.condition) condition = parsed.condition.$in.map((c) => c.replace('Grade ', '')).join(',');
      if (parsed.price) maxPrice = parsed.price.$lte || maxPrice;
      if (parsed.distanceKm) maxKm = parsed.distanceKm.$lte;
    } catch { /* fall back to plain keyword search */ }
  }
  const listings = await Listing.find({ status: 'Active' }).populate('materialId').populate('sellerId', 'name rating location');
  const here = req.user.location.coordinates; const limit = +maxKm || 50;
  const conds = condition ? condition.split(',') : null;
  const out = listings.filter((l) => l.materialId && l.sellerId).map((l) => {
    const km = haversineKm(here, l.sellerId.location.coordinates);
    const sim = material ? (l.materialId.materialType === material ? 1 : 0) : similarity(q, l.materialId);
    return { ...l.toObject(), distanceKm: Math.round(km * 10) / 10,
      matchRankScore: matchScore({ sim, distanceKm: km, maxKm: limit, price: l.price, maxPrice: +maxPrice || null, rating: l.sellerId.rating }) };
  }).filter((l) => (!material || l.materialId.materialType === material) && (!conds || conds.includes(l.materialId.conditionScore))
      && (!maxPrice || l.price <= +maxPrice) && (!maxKm || l.distanceKm <= +maxKm))
    .sort((a, b) => b.matchRankScore - a.matchRankScore);
  res.json({ parsedFilters: parsed, results: out });
}));

r.delete('/:id', auth, requireRole('Company', 'Admin'), wrap(async (req, res) => {
  const l = await Listing.findOne({ _id: req.params.id, ...(req.user.role === 'Admin' ? {} : { sellerId: req.user._id }) });
  if (!l) return res.status(404).json({ error: 'Not found' });
  l.status = 'Removed'; await l.save(); await Material.findByIdAndUpdate(l.materialId, { status: 'Available' });
  res.json({ removed: true });
}));
module.exports = r; module.exports.createListing = createListing;
