const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultProducts } = require('../data/productStore');

test('seeded books use the ₹99 price in paise', () => {
  const playbook = defaultProducts.find((product) => product.slug === '30-day-creator-playbook');
  assert.ok(playbook);
  assert.equal(playbook.pricePaise, 9900);
});
