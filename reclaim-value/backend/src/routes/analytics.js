const r = require('express').Router(); const { Material, Listing, Transaction, User } = require('../models');
const { auth, wrap } = require('../middleware'); r.use(auth);

r.get('/summary', wrap(async (req, res) => {
  if (req.user.role === 'Admin') {
    const [users, materials, listings, tx] = await Promise.all([User.countDocuments(), Material.countDocuments(), Listing.countDocuments({ status: 'Active' }), Transaction.find()]);
    return res.json({ users, materials, activeListings: listings, trades: tx.length, wasteDivertedKg: tx.reduce((s, t) => s + t.wasteDivertedKg, 0), co2SavedTons: +tx.reduce((s, t) => s + t.co2SavedEst, 0).toFixed(2) });
  }
  const mats = await Material.find({ ownerId: req.user._id });
  const tx = await Transaction.find({ $or: [{ sellerId: req.user._id }, { buyerId: req.user._id }] });
  const byType = {}; mats.forEach((m) => { byType[m.materialType] = (byType[m.materialType] || 0) + (m.estimatedValue || 0); });
  res.json({ inventoryCount: mats.length, inventoryKg: mats.reduce((s, m) => s + m.quantity, 0),
    listedValue: mats.filter((m) => m.status === 'Listed').reduce((s, m) => s + (m.estimatedValue || 0), 0),
    revenue: tx.filter((t) => String(t.sellerId) === String(req.user._id)).reduce((s, t) => s + t.finalPrice, 0),
    wasteDivertedKg: tx.reduce((s, t) => s + t.wasteDivertedKg, 0), co2SavedTons: +tx.reduce((s, t) => s + t.co2SavedEst, 0).toFixed(2), valueByType: byType });
}));
module.exports = r;
