const r = require('express').Router();
const { PurchaseRequest, Listing, Material, Transaction } = require('../models'); const { auth, requireRole, wrap } = require('../middleware');
const { co2For } = require('../utils');
r.use(auth);

r.post('/', requireRole('Buyer', 'Recycler'), wrap(async (req, res) => {
  const { listingId, offeredPrice, quantity } = req.body;
  const l = await Listing.findOne({ _id: listingId, status: 'Active' });
  if (!l) return res.status(404).json({ error: 'Listing not available' });
  if (quantity > l.askingQty) return res.status(400).json({ error: 'Quantity exceeds listing' });
  res.status(201).json(await PurchaseRequest.create({ listingId, buyerId: req.user._id, offeredPrice: offeredPrice ?? l.price, quantity: quantity ?? l.askingQty }));
}));

// Buyers see their requests; Companies see requests on their listings
r.get('/', wrap(async (req, res) => {
  if (req.user.role === 'Company') {
    const ids = (await Listing.find({ sellerId: req.user._id }).select('_id')).map((x) => x._id);
    return res.json(await PurchaseRequest.find({ listingId: { $in: ids } }).populate({ path: 'listingId', populate: 'materialId' }).populate('buyerId', 'name rating').sort('-createdAt'));
  }
  res.json(await PurchaseRequest.find({ buyerId: req.user._id }).populate({ path: 'listingId', populate: 'materialId' }).sort('-createdAt'));
}));

r.patch('/:id', requireRole('Company'), wrap(async (req, res) => {
  const { decision } = req.body; // 'Accepted' | 'Rejected'
  if (!['Accepted', 'Rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be Accepted or Rejected' });
  const pr = await PurchaseRequest.findById(req.params.id).populate('listingId');
  if (!pr || String(pr.listingId.sellerId) !== String(req.user._id)) return res.status(404).json({ error: 'Not found' });
  if (pr.requestStatus !== 'Pending') return res.status(409).json({ error: 'Already decided' });
  pr.requestStatus = decision; await pr.save();
  if (decision === 'Accepted') {
    const l = pr.listingId; const m = await Material.findById(l.materialId);
    l.status = 'Sold'; await l.save(); m.status = 'Sold'; await m.save();
    await Transaction.create({ requestId: pr._id, sellerId: l.sellerId, buyerId: pr.buyerId, finalPrice: pr.offeredPrice,
      co2SavedEst: co2For(m.materialType, pr.quantity), wasteDivertedKg: pr.quantity });
    await PurchaseRequest.updateMany({ listingId: l._id, _id: { $ne: pr._id }, requestStatus: 'Pending' }, { requestStatus: 'Rejected' });
  }
  res.json(pr);
}));
module.exports = r;
