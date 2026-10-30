require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Material, Listing } = require('../src/models');

const DEMO_EMAIL = 'demo-supplier@reclaim-value.local';
const DEMO_NAME = 'Reclaim Value Demo Supplier';
const TARGET_ACTIVE_LISTINGS = 50;
const MATERIALS = [
  { type: 'steel', basePrice: 40 },
  { type: 'concrete', basePrice: 1.5 },
  { type: 'brick', basePrice: 6 },
  { type: 'wood', basePrice: 25 },
  { type: 'tiles', basePrice: 18 },
  { type: 'glass', basePrice: 10 },
];
const CONDITION_MULTIPLIERS = { A: 1, B: 0.8, C: 0.55, D: 0.25 };

function demoListingData(index) {
  const material = MATERIALS[(index - 1) % MATERIALS.length];
  const condition = ['A', 'B', 'C', 'D'][(index - 1) % 4];
  const quantity = 150 + ((index * 317) % 2851);
  const demand = 0.35 + ((index * 13) % 60) / 100;
  const distanceKm = 2 + ((index * 7) % 35);
  const variation = 0.9 + (index % 5) * 0.05;
  const unitPrice = material.basePrice * CONDITION_MULTIPLIERS[condition]
    * (0.8 + 0.4 * demand)
    * (1 - Math.min(0.15, quantity / 100000) - Math.min(0.1, distanceKm / 500))
    * variation;

  return {
    materialType: material.type,
    conditionScore: condition,
    quantity,
    estimatedValue: Math.round(unitPrice * quantity),
    askingQty: quantity,
    price: Math.round(unitPrice * quantity),
    siteName: `DEMO-${String(index).padStart(3, '0')}`,
    storageCostPerDay: 0,
    recommendation: {
      action: 'Reuse',
      matchScore: 0,
      avoidedCo2Tons: 0,
      justification: 'Sample listing for demonstration only; not a verified assessment.',
    },
  };
}

async function getDemoSeller() {
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    if (existing.name !== DEMO_NAME || existing.role !== 'Company') {
      throw new Error(`Refusing to reuse unexpected account at ${DEMO_EMAIL}`);
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  return User.create({
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    passwordHash,
    role: 'Company',
    location: { type: 'Point', coordinates: [76.38, 30.33] },
    rating: 4.5,
    verified: true,
  });
}

async function countActiveDemoListings(sellerId) {
  const demoMaterials = await Material.find({
    ownerId: sellerId,
    siteName: /^DEMO-\d+$/,
    status: 'Listed',
  }).distinct('_id');
  return Listing.countDocuments({
    sellerId,
    materialId: { $in: demoMaterials },
    status: 'Active',
  });
}

async function seedDemoListings() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const seller = await getDemoSeller();
  let activeCount = await countActiveDemoListings(seller._id);
  if (activeCount >= TARGET_ACTIVE_LISTINGS) {
    console.log(`Demo data already has ${activeCount} active listings; nothing to add.`);
    return;
  }

  for (let index = 1; activeCount < TARGET_ACTIVE_LISTINGS && index <= 1000; index += 1) {
    const data = demoListingData(index);
    let material = await Material.findOne({ ownerId: seller._id, siteName: data.siteName });
    if (material) {
      const existingListing = await Listing.findOne({ sellerId: seller._id, materialId: material._id });
      if (existingListing) continue;
      if (material.status !== 'Available' && material.status !== 'Listed') continue;
    } else {
      material = await Material.create({
        ownerId: seller._id,
        materialType: data.materialType,
        conditionScore: data.conditionScore,
        quantity: data.quantity,
        estimatedValue: data.estimatedValue,
        siteName: data.siteName,
        storageCostPerDay: data.storageCostPerDay,
        recommendation: data.recommendation,
      });
    }

    await Listing.create({
      materialId: material._id,
      sellerId: seller._id,
      price: data.price,
      askingQty: data.askingQty,
      status: 'Active',
    });
    material.status = 'Listed';
    await material.save();
    activeCount += 1;
  }

  if (activeCount < TARGET_ACTIVE_LISTINGS) {
    throw new Error(`Could only create ${activeCount} active demo listings`);
  }
  console.log(`Demo supplier ready with ${activeCount} active sample listings.`);
  console.log('These generated listings and prices are for UI demonstration only, not real offers.');
}

seedDemoListings()
  .catch((error) => {
    console.error('Failed to seed demo listings:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
