const Razorpay = require('razorpay');

function getRazorpayMode() {
  const defaultMode = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  const mode = (process.env.RAZORPAY_MODE || defaultMode).trim().toLowerCase();
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('RAZORPAY_MODE must be either "test" or "live".');
  }
  return mode;
}

function getRazorpayConfig() {
  const mode = getRazorpayMode();
  const rawKeyId = process.env.RAZORPAY_KEY_ID || '';
  const rawKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const keyId = rawKeyId.trim();
  const keySecret = rawKeySecret.trim();
  const expectedPrefix = mode === 'test' ? 'rzp_test_' : 'rzp_live_';

  return {
    mode,
    keyId,
    keySecret,
    expectedPrefix,
    hasSurroundingWhitespace: rawKeyId !== keyId || rawKeySecret !== keySecret,
  };
}

function getRazorpayConfigDiagnostics() {
  const { mode, keyId, keySecret, expectedPrefix, hasSurroundingWhitespace } = getRazorpayConfig();

  return {
    mode,
    keyIdPresent: Boolean(keyId),
    keySecretPresent: Boolean(keySecret),
    keyPrefixMatches: keyId.startsWith(expectedPrefix),
    hasSurroundingWhitespace,
  };
}

function getRazorpayKeyId() {
  return getRazorpayConfig().keyId;
}

function getRazorpayKeySecret() {
  return getRazorpayConfig().keySecret;
}

function isRazorpayConfigured() {
  const { keyId, keySecret, expectedPrefix } = getRazorpayConfig();

  return Boolean(
    keyId &&
      keySecret &&
      keyId.startsWith(expectedPrefix) &&
      !/your_|replace_with|<[^>]+>/i.test(keyId) &&
      !/your_|replace_with|<[^>]+>/i.test(keySecret)
  );
}

function createRazorpayClient() {
  const { mode, keyId, keySecret, expectedPrefix } = getRazorpayConfig();

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

module.exports = {
  createRazorpayClient,
  getRazorpayConfigDiagnostics,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getRazorpayMode,
  isRazorpayConfigured,
};
