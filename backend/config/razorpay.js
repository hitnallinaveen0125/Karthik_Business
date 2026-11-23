const Razorpay = require('razorpay');

function getRazorpayMode() {
  const mode = (process.env.RAZORPAY_MODE || 'test').trim().toLowerCase();
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('RAZORPAY_MODE must be either "test" or "live".');
  }
  return mode;
}

function isRazorpayConfigured() {
  const mode = getRazorpayMode();
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  const expectedPrefix = mode === 'test' ? 'rzp_test_' : 'rzp_live_';

  return Boolean(
    keyId &&
      keySecret &&
      keyId.startsWith(expectedPrefix) &&
      !/your_|replace_with|<[^>]+>/i.test(keyId) &&
      !/your_|replace_with|<[^>]+>/i.test(keySecret)
  );
}

function createRazorpayClient() {
  const mode = getRazorpayMode();
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  const expectedPrefix = mode === 'test' ? 'rzp_test_' : 'rzp_live_';

  if (
    !keyId ||
    !keySecret ||
    /your_|replace_with|<[^>]+>/i.test(keyId) ||
    /your_|replace_with|<[^>]+>/i.test(keySecret)
  ) {
    throw new Error(`Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for Razorpay ${mode} mode.`);
  }
  if (!keyId.startsWith(expectedPrefix)) {
    throw new Error(`RAZORPAY_KEY_ID must start with "${expectedPrefix}" when RAZORPAY_MODE=${mode}.`);
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

module.exports = { createRazorpayClient, getRazorpayMode, isRazorpayConfigured };
