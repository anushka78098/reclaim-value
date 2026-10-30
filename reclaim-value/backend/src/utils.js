const WEIGHTS = { sim: 0.35, dist: 0.25, price: 0.25, rating: 0.15 };
const CO2_PER_KG = { steel: 1.5, concrete: 0.1, brick: 0.22, wood: 0.4, tiles: 0.7, glass: 0.85 };

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Match index S = w1*Sim + w2*Dist + w3*Price + w4*Rating  (all terms normalised to 0..1) */
function matchScore({ sim, distanceKm, maxKm = 50, price, maxPrice, rating }, w = WEIGHTS) {
  const dist = 1 - Math.min(distanceKm / maxKm, 1);
  const p = maxPrice ? 1 - Math.min(price / maxPrice, 1) : 0.5;
  const s = w.sim * sim + w.dist * dist + w.price * p + w.rating * (rating / 5);
  return Math.round(s * 1000) / 1000;
}

function similarity(query, material) {
  if (!query) return 0.5;
  const toks = query.toLowerCase().split(/\W+/).filter(Boolean);
  const hay = `${material.materialType} ${material.conditionScore} ${material.siteName || ''}`.toLowerCase();
  const hit = toks.filter((t) => hay.includes(t)).length;
  return toks.length ? hit / toks.length : 0.5;
}

const co2For = (type, kg) => Math.round((CO2_PER_KG[type] || 0.1) * kg) / 1000; // tonnes

module.exports = { haversineKm, matchScore, similarity, co2For, WEIGHTS };
