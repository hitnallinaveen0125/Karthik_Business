const test = require('node:test');
const assert = require('node:assert/strict');
const { createRazorpayClient, getRazorpayMode, isRazorpayConfigured } = require('../config/razorpay');
const { Product } = require('../models');
const { getProductBySlugRoute } = require('../controllers/paymentController');

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  mode: process.env.RAZORPAY_MODE,
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
};

test.afterEach(() => {
  if (originalEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv.nodeEnv;
  if (originalEnv.mode === undefined) delete process.env.RAZORPAY_MODE;
  else process.env.RAZORPAY_MODE = originalEnv.mode;
  if (originalEnv.keyId === undefined) delete process.env.RAZORPAY_KEY_ID;
  else process.env.RAZORPAY_KEY_ID = originalEnv.keyId;
  if (originalEnv.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = originalEnv.keySecret;
});

test('defaults to test mode outside production and accepts only test keys', () => {
  process.env.NODE_ENV = 'test';
  delete process.env.RAZORPAY_MODE;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_local-check';
  process.env.RAZORPAY_KEY_SECRET = 'test-secret-local-check';

  assert.equal(getRazorpayMode(), 'test');
  assert.ok(createRazorpayClient());
});

test('defaults to live mode in production and rejects missing live credentials', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.RAZORPAY_MODE;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_local-check';
  process.env.RAZORPAY_KEY_SECRET = 'test-secret-local-check';

  assert.equal(getRazorpayMode(), 'live');
  assert.equal(isRazorpayConfigured(), false);
  assert.throws(() => createRazorpayClient(), /must start with "rzp_live_"/);
});

test('does not allow live Razorpay keys while test mode is selected', () => {
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_KEY_ID = 'rzp_live_local-check';
  process.env.RAZORPAY_KEY_SECRET = 'test-secret-local-check';

  assert.throws(() => createRazorpayClient(), /must start with "rzp_test_"/);
});

test('requires explicit live mode before accepting live keys', () => {
  process.env.RAZORPAY_MODE = 'live';
  process.env.RAZORPAY_KEY_ID = 'rzp_live_local-check';
  process.env.RAZORPAY_KEY_SECRET = 'live-secret-local-check';

  assert.equal(getRazorpayMode(), 'live');
  assert.ok(createRazorpayClient());
});

test('rejects template credentials instead of attempting checkout with placeholders', () => {
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_your_key_id';
  process.env.RAZORPAY_KEY_SECRET = 'your_razorpay_test_key_secret';

  assert.throws(() => createRazorpayClient(), /Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET/);
});

test('reports checkout unavailable for missing or mode-mismatched credentials', () => {
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_KEY_ID = '';
  process.env.RAZORPAY_KEY_SECRET = '';
  assert.equal(isRazorpayConfigured(), false);

  process.env.RAZORPAY_KEY_ID = 'rzp_live_local-check';
  process.env.RAZORPAY_KEY_SECRET = 'test-secret-local-check';
  assert.equal(isRazorpayConfigured(), false);

  process.env.RAZORPAY_KEY_ID = 'rzp_test_local-check';
  assert.equal(isRazorpayConfigured(), true);
});

test('includes the configured Razorpay mode in product details', async () => {
  const originalFindOne = Product.findOne;
  process.env.RAZORPAY_MODE = 'live';
  Product.findOne = async () => ({
    productId: 'prod_test',
    slug: 'test-product',
    title: 'Test product',
    description: 'Test product description',
    pricePaise: 1,
    coverImage: '',
    creatorName: 'Test creator',
    isPublished: true,
  });
  const response = {
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await getProductBySlugRoute({ params: { slug: 'test-product' } }, response);
    assert.equal(response.body.paymentMode, 'live');
  } finally {
    Product.findOne = originalFindOne;
  }
});
