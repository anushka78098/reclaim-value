const mongoose = require('mongoose');
const { Schema } = mongoose; const oid = Schema.Types.ObjectId;

const userSchema = new Schema({
  name: { type: String, required: true }, email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['Company', 'Buyer', 'Recycler', 'Admin'], default: 'Buyer' },
  location: { type: { type: String, default: 'Point' }, coordinates: { type: [Number], default: [76.38, 30.33] } }, // [lng, lat]
  rating: { type: Number, default: 4 }, verified: { type: Boolean, default: false }, suspended: { type: Boolean, default: false },
}, { timestamps: true });
userSchema.index({ location: '2dsphere' });

const materialSchema = new Schema({
  ownerId: { type: oid, ref: 'User', required: true, index: true },
  materialType: String, conditionScore: { type: String, enum: ['A', 'B', 'C', 'D'] }, quantity: Number, // kg
  estimatedValue: Number, images: [String], siteName: String, storageCostPerDay: { type: Number, default: 0 },
  status: { type: String, enum: ['Available', 'Listed', 'Sold', 'Reused', 'Recycled', 'Disposed'], default: 'Available' },
  recommendation: { action: String, matchScore: Number, avoidedCo2Tons: Number, justification: String },
}, { timestamps: true });

const listingSchema = new Schema({
  materialId: { type: oid, ref: 'Material', required: true }, sellerId: { type: oid, ref: 'User', required: true },
  price: Number, askingQty: Number, status: { type: String, enum: ['Active', 'Sold', 'Removed'], default: 'Active' },
  matchRankScore: { type: Number, default: 0 },
}, { timestamps: true });

const requestSchema = new Schema({
  listingId: { type: oid, ref: 'Listing', required: true }, buyerId: { type: oid, ref: 'User', required: true },
  offeredPrice: Number, quantity: Number, requestStatus: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
}, { timestamps: true });

const transactionSchema = new Schema({
  requestId: { type: oid, ref: 'PurchaseRequest' }, sellerId: { type: oid, ref: 'User' }, buyerId: { type: oid, ref: 'User' },
  finalPrice: Number, co2SavedEst: Number, wasteDivertedKg: Number, timestamp: { type: Date, default: Date.now },
});

module.exports = {
  User: mongoose.model('User', userSchema), Material: mongoose.model('Material', materialSchema),
  Listing: mongoose.model('Listing', listingSchema), PurchaseRequest: mongoose.model('PurchaseRequest', requestSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
};
