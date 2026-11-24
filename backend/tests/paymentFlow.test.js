const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const razorpayConfigPath = require.resolve('../config/razorpay');
const databasePath = require.resolve('../config/database');
const downloadTokensPath = require.resolve('../utils/downloadTokens');
const originalRazorpayConfig = require(razorpayConfigPath);
const originalDatabase = require(databasePath);
const originalDownloadTokens = require(downloadTokensPath);
const models = require('../models');

let razorpayClient;
let gridFsFile;
let downloadToken;
let downloadTokenCreationCount;

require.cache[razorpayConfigPath].exports = {
  ...originalRazorpayConfig,
  createRazorpayClient: () => razorpayClient,
};
require.cache[databasePath].exports = {
  ...originalDatabase,
  findGridFSFile: async () => gridFsFile,
};
require.cache[downloadTokensPath].exports = {
  ...originalDownloadTokens,
  createDownloadTokenForOrder: async () => {
    downloadTokenCreationCount += 1;
    return downloadToken;
  },
};

const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleWebhook,
} = require('../controllers/paymentController');

const originalModelMethods = {
  productFindOne: models.Product.findOne,
  orderCreate: models.Order.create,
  orderFindOne: models.Order.findOne,
  orderUpdateOne: models.Order.updateOne,
  paymentUpdateOne: models.Payment.updateOne,
  saleUpdateOne: models.Sale.updateOne,
  webhookExists: models.WebhookEvent.exists,
  webhookCreate: models.WebhookEvent.create,
};
const originalEnv = {
  mode: process.env.RAZORPAY_MODE,
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
};

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

function createOrder() {
  return {
    _id: 'mongo-order-id',
    internalOrderReference: 'internal-order-1',
    productId: 'product-1',
    customerId: 'customer-1',
    customerName: 'Test Customer',
    customerEmail: 'customer@example.com',
    amountPaise: 9900,
    currency: 'INR',
    razorpayOrderId: 'order_razorpay_1',
    razorpayPaymentId: null,
    orderStatus: 'pending',
    paidAt: null,
    async save() {},
  };
}

function signPayment(orderId, paymentId) {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function signWebhook(body) {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
}

test.beforeEach(() => {
  process.env.RAZORPAY_MODE = 'live';
  process.env.RAZORPAY_KEY_ID = 'rzp_live_public-check';
  process.env.RAZORPAY_KEY_SECRET = 'unit-test-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'unit-test-webhook-secret';
  gridFsFile = { _id: 'file-1', length: 100 };
  downloadToken = 'download-token';
  downloadTokenCreationCount = 0;
  razorpayClient = {
    orders: {
      create: async () => ({
        id: 'order_razorpay_1',
        amount: 9900,
        currency: 'INR',
      }),
    },
    payments: {
      fetch: async () => ({
        id: 'payment_1',
        order_id: 'order_razorpay_1',
        amount: 9900,
        currency: 'INR',
        status: 'captured',
        captured: true,
      }),
    },
  };
});

test.afterEach(() => {
  models.Product.findOne = originalModelMethods.productFindOne;
  models.Order.create = originalModelMethods.orderCreate;
  models.Order.findOne = originalModelMethods.orderFindOne;
  models.Order.updateOne = originalModelMethods.orderUpdateOne;
  models.Payment.updateOne = originalModelMethods.paymentUpdateOne;
  models.Sale.updateOne = originalModelMethods.saleUpdateOne;
  models.WebhookEvent.exists = originalModelMethods.webhookExists;
  models.WebhookEvent.create = originalModelMethods.webhookCreate;
  for (const [key, value] of Object.entries(originalEnv)) {
    const name = {
      mode: 'RAZORPAY_MODE',
      keyId: 'RAZORPAY_KEY_ID',
      keySecret: 'RAZORPAY_KEY_SECRET',
      webhookSecret: 'RAZORPAY_WEBHOOK_SECRET',
    }[key];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('creates a backend order at the stored amount and returns only the public key', async () => {
  const product = {
    productId: 'product-1',
    title: 'Test Product',
    pricePaise: 9900,
    gridFsFileId: 'file-1',
  };
  let razorpayOrderRequest;
  let storedOrder;
  models.Product.findOne = async () => product;
  models.Order.create = async (value) => {
    storedOrder = value;
  };
  razorpayClient.orders.create = async (value) => {
    razorpayOrderRequest = value;
    return { id: 'order_razorpay_1', amount: 9900, currency: 'INR' };
  };
  const response = createResponse();

  await createRazorpayOrder(
    {
      body: { productId: 'product-1' },
      customer: {
        _id: 'customer-1',
        name: 'Test Customer',
        email: 'customer@example.com',
      },
    },
    response
  );

  assert.equal(razorpayOrderRequest.amount, 9900);
  assert.equal(razorpayOrderRequest.currency, 'INR');
  assert.equal(storedOrder.razorpayOrderId, 'order_razorpay_1');
  assert.equal(storedOrder.orderStatus, 'pending');
  assert.equal(response.body.key, 'rzp_live_public-check');
  assert.equal(JSON.stringify(response.body).includes(process.env.RAZORPAY_KEY_SECRET), false);
});

test('verifies a captured payment and records one paid purchase', async () => {
  const order = createOrder();
  const writes = { order: 0, payment: 0, sale: 0 };
  models.Order.findOne = async () => order;
  models.Product.findOne = async () => ({
    productId: 'product-1',
    creatorId: 'creator-1',
    gridFsFileId: 'file-1',
  });
  models.Order.updateOne = async () => { writes.order += 1; };
  models.Payment.updateOne = async () => { writes.payment += 1; };
  models.Sale.updateOne = async () => { writes.sale += 1; };
  const response = createResponse();

  await verifyRazorpayPayment(
    {
      body: {
        internalOrderId: order.internalOrderReference,
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: 'payment_1',
        razorpay_signature: signPayment(order.razorpayOrderId, 'payment_1'),
      },
      customer: { _id: 'customer-1' },
    },
    response
  );

  assert.equal(response.body.status, 'paid');
  assert.equal(response.body.downloadToken, downloadToken);
  assert.equal(downloadTokenCreationCount, 1);
  assert.deepEqual(writes, { order: 1, payment: 1, sale: 1 });
});

test('rejects invalid signatures without fetching or recording a payment', async () => {
  let fetchCount = 0;
  let orderWriteCount = 0;
  const order = createOrder();
  models.Order.findOne = async () => order;
  models.Order.updateOne = async () => { orderWriteCount += 1; };
  razorpayClient.payments.fetch = async () => { fetchCount += 1; };
  const response = createResponse();

  await verifyRazorpayPayment(
    {
      body: {
        internalOrderId: order.internalOrderReference,
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: 'payment_1',
        razorpay_signature: 'invalid',
      },
      customer: { _id: 'customer-1' },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(fetchCount, 0);
  assert.equal(orderWriteCount, 0);
});

test('rejects a client-supplied Razorpay order ID that does not match the stored order', async () => {
  let fetchCount = 0;
  const order = createOrder();
  models.Order.findOne = async () => order;
  razorpayClient.payments.fetch = async () => { fetchCount += 1; };
  const response = createResponse();

  await verifyRazorpayPayment(
    {
      body: {
        internalOrderId: order.internalOrderReference,
        razorpay_order_id: 'order_mismatched',
        razorpay_payment_id: 'payment_1',
        razorpay_signature: signPayment('order_mismatched', 'payment_1'),
      },
      customer: { _id: 'customer-1' },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(fetchCount, 0);
});

test('rejects captured payments with a mismatched amount or currency', async () => {
  let orderWriteCount = 0;
  models.Order.findOne = async () => createOrder();
  models.Order.updateOne = async () => { orderWriteCount += 1; };

  for (const mismatch of [{ amount: 9800 }, { currency: 'USD' }]) {
    const order = createOrder();
    razorpayClient.payments.fetch = async () => ({
      id: 'payment_1',
      order_id: order.razorpayOrderId,
      amount: mismatch.amount || order.amountPaise,
      currency: mismatch.currency || order.currency,
      status: 'captured',
      captured: true,
    });
    const response = createResponse();

    await verifyRazorpayPayment(
      {
        body: {
          internalOrderId: order.internalOrderReference,
          razorpay_order_id: order.razorpayOrderId,
          razorpay_payment_id: 'payment_1',
          razorpay_signature: signPayment(order.razorpayOrderId, 'payment_1'),
        },
        customer: { _id: 'customer-1' },
      },
      response
    );

    assert.equal(response.statusCode, 400);
    assert.equal(order.orderStatus, 'pending');
  }

  assert.equal(orderWriteCount, 0);
  assert.equal(downloadTokenCreationCount, 0);
});

test('rejects a different payment ID when an order already has a payment linked', async () => {
  const order = createOrder();
  order.razorpayPaymentId = 'payment_existing';
  let orderWriteCount = 0;
  models.Order.findOne = async () => order;
  models.Order.updateOne = async () => { orderWriteCount += 1; };
  const response = createResponse();

  await verifyRazorpayPayment(
    {
      body: {
        internalOrderId: order.internalOrderReference,
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: 'payment_1',
        razorpay_signature: signPayment(order.razorpayOrderId, 'payment_1'),
      },
      customer: { _id: 'customer-1' },
    },
    response
  );

  assert.equal(response.statusCode, 409);
  assert.equal(orderWriteCount, 0);
  assert.equal(downloadTokenCreationCount, 0);
});

test('does not mark an uncaptured payment as paid', async () => {
  const order = createOrder();
  let orderWriteCount = 0;
  models.Order.findOne = async () => order;
  models.Order.updateOne = async () => { orderWriteCount += 1; };
  razorpayClient.payments.fetch = async () => ({
    id: 'payment_1',
    order_id: order.razorpayOrderId,
    amount: order.amountPaise,
    currency: order.currency,
    status: 'failed',
    captured: false,
  });
  const response = createResponse();

  await verifyRazorpayPayment(
    {
      body: {
        internalOrderId: order.internalOrderReference,
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: 'payment_1',
        razorpay_signature: signPayment(order.razorpayOrderId, 'payment_1'),
      },
      customer: { _id: 'customer-1' },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(orderWriteCount, 0);
  assert.equal(downloadTokenCreationCount, 0);
  assert.equal(order.orderStatus, 'pending');
});

test('verifies the webhook signature and records a failed payment without unlocking it', async () => {
  const order = createOrder();
  let paymentWrite;
  let eventWrite;
  models.WebhookEvent.exists = async () => false;
  models.WebhookEvent.create = async (value) => { eventWrite = value; };
  models.Order.findOne = async () => order;
  models.Payment.updateOne = async (...args) => { paymentWrite = args; };
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'payment_failed_1',
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: order.currency,
        },
      },
    },
  }));
  const response = createResponse();

  await handleWebhook(
    {
      body: rawBody,
      headers: {
        'x-razorpay-signature': signWebhook(rawBody),
        'x-razorpay-event-id': 'event-1',
      },
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(order.orderStatus, 'failed');
  assert.equal(paymentWrite[1].$set.status, 'failed');
  assert.equal(paymentWrite[1].$set.captured, false);
  assert.equal(eventWrite.eventId, 'event-1');
});

test('rejects invalid webhook signatures before changing purchase state', async () => {
  let orderLookupCount = 0;
  models.Order.findOne = async () => { orderLookupCount += 1; };
  const rawBody = Buffer.from('{"event":"payment.failed"}');
  const response = createResponse();

  await handleWebhook(
    {
      body: rawBody,
      headers: {
        'x-razorpay-signature': 'invalid',
        'x-razorpay-event-id': 'event-invalid',
      },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(orderLookupCount, 0);
});
