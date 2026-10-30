const { matchScore, haversineKm, co2For, similarity } = require('../src/utils');
test('closer, cheaper, better-rated listing ranks higher', () => {
  const a = matchScore({ sim: 1, distanceKm: 5, price: 20000, maxPrice: 30000, rating: 5 });
  const b = matchScore({ sim: 1, distanceKm: 40, price: 29000, maxPrice: 30000, rating: 3 });
  expect(a).toBeGreaterThan(b);
});
test('score stays within 0..1', () => {
  const s = matchScore({ sim: 1, distanceKm: 0, price: 0, maxPrice: 10, rating: 5 }); expect(s).toBeLessThanOrEqual(1);
});
test('haversine Patiala->Chandigarh ≈ 60km', () => { expect(haversineKm([76.38, 30.33], [76.78, 30.73])).toBeGreaterThan(50); expect(haversineKm([76.38, 30.33], [76.78, 30.73])).toBeLessThan(70); });
test('1200kg steel avoids 1.8t CO2', () => expect(co2For('steel', 1200)).toBe(1.8));
test('similarity matches tokens', () => expect(similarity('steel beam', { materialType: 'steel', conditionScore: 'B' })).toBe(0.5));
