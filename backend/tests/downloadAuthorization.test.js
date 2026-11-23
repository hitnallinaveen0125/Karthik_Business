const test = require('node:test');
const assert = require('node:assert/strict');
const { DownloadToken, Order } = require('../models');
const { handleSecureDownload } = require('../controllers/downloadController');

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('rejects an unknown download token before accessing an order or GridFS', async () => {
  const originalFindOne = DownloadToken.findOne;
  DownloadToken.findOne = async () => null;
  const response = createResponse();

  try {
    await handleSecureDownload({ params: { token: 'not-a-valid-grant' } }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
  } finally {
    DownloadToken.findOne = originalFindOne;
  }
});

test('rejects a valid token when its order is not paid', async () => {
  const originalTokenFindOne = DownloadToken.findOne;
  const originalOrderFindOne = Order.findOne;
  DownloadToken.findOne = async () => ({
    internalOrderReference: 'order_test',
    productId: 'prod_001',
  });
  Order.findOne = async () => null;
  const response = createResponse();

  try {
    await handleSecureDownload({ params: { token: 'valid-format-token' } }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
  } finally {
    DownloadToken.findOne = originalTokenFindOne;
    Order.findOne = originalOrderFindOne;
  }
});
