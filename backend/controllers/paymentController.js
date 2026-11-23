const crypto = require('crypto');
const { createRazorpayClient, getRazorpayMode, isRazorpayConfigured } = require('../config/razorpay');
const { findGridFSFile } = require('../config/database');
const { Product, Order, Payment, Sale, WebhookEvent } = require('../models');
const { createDownloadTokenForOrder } = require('../utils/downloadTokens');

function createReceiptId() {
  return `ord_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getSignatureStatus(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error('Razorpay is not configured on the server.');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  if (!/^[a-f\d]{64}$/i.test(signature)) {
    return false;
  }
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function serializeProduct(product) {
  return {
    id: product.productId,
    slug: product.slug,
    title: product.title,
    description: product.description,
    pricePaise: product.pricePaise,
    coverImage: product.coverImage,
    creatorName: product.creatorName,
    isPublished: product.isPublished,
  };
}

function serializeOrder(order) {
  return {
    internalOrderReference: order.internalOrderReference,
    productId: order.productId,
    amountPaise: order.amountPaise,
    currency: order.currency,
    orderStatus: order.orderStatus,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId || null,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
  };
}

async function findOrderByReference(orderReference) {
  return Order.findOne({
    $or: [{ internalOrderReference: orderReference }, { razorpayOrderId: orderReference }],
  });
}

async function recordCapturedPayment(order, payment) {
  if (order.orderStatus === 'refunded') {
    throw createHttpError(409, 'A refunded order cannot be marked paid or used for download.');
  }
  if (
    payment.order_id !== order.razorpayOrderId ||
    payment.amount !== order.amountPaise ||
    payment.currency !== order.currency ||
    payment.status !== 'captured' ||
    payment.captured !== true
  ) {
    throw createHttpError(400, 'Razorpay payment is not captured for the expected order, amount, and currency.');
  }

  if (order.razorpayPaymentId && order.razorpayPaymentId !== payment.id) {
    throw createHttpError(409, 'A different payment is already linked to this order.');
  }

  const product = await Product.findOne({ productId: order.productId });
  if (!product || !product.gridFsFileId) {
    throw createHttpError(409, 'The purchased product does not have a PDF configured in GridFS.');
  }

  const file = await findGridFSFile(product.gridFsFileId);
  if (!file) {
    throw createHttpError(409, 'The purchased product PDF is missing from GridFS.');
  }

  const paidAt = order.paidAt || new Date();
  await Order.updateOne(
    { _id: order._id, orderStatus: { $ne: 'refunded' } },
    {
      $set: {
        orderStatus: 'paid',
        paidAt,
        razorpayPaymentId: payment.id,
      },
    }
  );
  order.orderStatus = 'paid';
  order.paidAt = paidAt;
  order.razorpayPaymentId = payment.id;

  await Payment.updateOne(
    { razorpayPaymentId: payment.id },
    {
      $set: {
        orderReference: order.internalOrderReference,
        razorpayOrderId: payment.order_id,
        amountPaise: payment.amount,
        currency: payment.currency,
        status: payment.status,
        captured: payment.captured,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  await Sale.updateOne(
    { internalOrderReference: order.internalOrderReference },
    {
      $setOnInsert: {
        internalOrderReference: order.internalOrderReference,
        productId: order.productId,
        creatorId: product.creatorId,
        grossAmountPaise: order.amountPaise,
        refundAmountPaise: 0,
        netAmountPaise: order.amountPaise,
        saleStatus: 'paid',
        createdAt: paidAt,
      },
    },
    { upsert: true }
  );

  console.log('[Payment] MongoDB order marked paid:', order.internalOrderReference);
  console.log('[Payment] captured payment verified:', payment.id, 'product:', product.productId, 'GridFS file:', product.gridFsFileId.toString());
}

async function createRazorpayOrder(req, res) {
  const { productId } = req.body;
  const customerName = req.customer.name;
  const customerEmail = req.customer.email;

  if (
    typeof productId !== 'string' ||
    typeof customerName !== 'string' ||
    typeof customerEmail !== 'string'
  ) {
    return res.status(400).json({ success: false, message: 'A valid product and signed-in customer account are required.' });
  }

  let razorpay;
  try {
    razorpay = createRazorpayClient();
  } catch (error) {
    console.error('[Payment] Razorpay configuration error:', error.message);
    return res.status(503).json({ success: false, message: error.message });
  }

  const product = await Product.findOne({ productId, isPublished: true });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found or not published.' });
  }
  if (!product.gridFsFileId) {
    return res.status(409).json({ success: false, message: 'This product PDF has not been uploaded yet.' });
  }

  const file = await findGridFSFile(product.gridFsFileId);
  if (!file) {
    console.error('[Payment] product references missing GridFS file:', product.productId, product.gridFsFileId.toString());
    return res.status(409).json({ success: false, message: 'This product PDF is unavailable. Please contact support.' });
  }

  const internalOrderReference = createReceiptId();
  const amountPaise = product.pricePaise;

  console.log('[Payment] creating order:', internalOrderReference, 'product:', product.productId, 'amount paise:', amountPaise);
  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: internalOrderReference,
    notes: {
      productId: product.productId,
      customerEmail: customerEmail.trim().toLowerCase(),
    },
  });

  await Order.create({
    internalOrderReference,
    productId: product.productId,
    customerId: req.customer._id,
    creatorId: product.creatorId,
    customerName: customerName.trim(),
    customerEmail: customerEmail.trim().toLowerCase(),
    amountPaise,
    currency: 'INR',
    razorpayOrderId: razorpayOrder.id,
    orderStatus: 'pending',
  });

  console.log('[Payment] Razorpay order stored:', razorpayOrder.id, 'internal order:', internalOrderReference);
  return res.json({
    success: true,
    message: 'Razorpay order created successfully.',
    internalOrderId: internalOrderReference,
    key: process.env.RAZORPAY_KEY_ID,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    order: { id: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency },
    product: { id: product.productId, title: product.title, pricePaise: product.pricePaise },
  });
}

async function verifyRazorpayPayment(req, res) {
  const { internalOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (
    typeof internalOrderId !== 'string' ||
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string'
  ) {
    return res.status(400).json({ success: false, message: 'Incomplete payment verification payload.' });
  }

  const order = await Order.findOne({ internalOrderReference: internalOrderId });
  if (!order) {
    return res.status(404).json({ success: false, message: 'Internal order not found.' });
  }
  if (!order.customerId || order.customerId.toString() !== req.customer._id.toString()) {
    return res.status(403).json({ success: false, message: 'This payment order does not belong to your account.' });
  }

  console.log('[Payment] verifying internal order:', internalOrderId, 'Razorpay order:', razorpay_order_id, 'payment:', razorpay_payment_id);
  if (order.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ success: false, message: 'Payment order mismatch.' });
  }

  let signatureValid;
  try {
    signatureValid = getSignatureStatus(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  } catch (error) {
    return res.status(503).json({ success: false, message: error.message });
  }
  console.log('[Payment] signature verification:', signatureValid ? 'valid' : 'invalid');
  if (!signatureValid) {
    return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
  }

  let payment;
  try {
    payment = await createRazorpayClient().payments.fetch(razorpay_payment_id);
  } catch (error) {
    console.error('[Payment] Razorpay payment lookup failed for order:', internalOrderId, error.message);
    return res.status(502).json({ success: false, message: 'Razorpay could not confirm the payment. Please retry verification.' });
  }

  try {
    console.log('[Payment] Razorpay payment captured status:', payment.status, payment.captured === true);
    await recordCapturedPayment(order, payment);
    const downloadToken = await createDownloadTokenForOrder(order);

    return res.json({
      success: true,
      message: 'Payment verified successfully.',
      order: serializeOrder(order),
      status: 'paid',
      downloadToken,
      downloadUrl: `/api/download/${downloadToken}`,
    });
  } catch (error) {
    console.error('[Payment] verification failed for order:', internalOrderId, error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode < 500 ? error.message : 'Payment verification could not be completed. Please retry.',
    });
  }
}

async function getPaymentStatus(req, res) {
  const order = await findOrderByReference(req.params.orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  return res.json({ success: true, order: serializeOrder(order) });
}

async function handleWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!rawBody.length || typeof signature !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing webhook payload or signature.' });
  }
  if (!webhookSecret) {
    console.error('[Webhook] RAZORPAY_WEBHOOK_SECRET is not configured.');
    return res.status(503).json({ success: false, message: 'Webhook verification is not configured.' });
  }

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest();
  if (!/^[a-f\d]{64}$/i.test(signature)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid webhook JSON payload.' });
  }

  const eventId = req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(rawBody).digest('hex');
  if (await WebhookEvent.exists({ eventId })) {
    console.log('[Webhook] duplicate event ignored:', eventId);
    return res.json({ success: true, message: 'Duplicate webhook ignored.' });
  }
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const refundEntity = event.payload?.refund?.entity;
  const isRefundEvent = event.event === 'refund.processed' || event.event === 'payment.refunded';
  let razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
  let refundPayment;

  if (isRefundEvent) {
    const refundPaymentId = refundEntity?.payment_id || paymentEntity?.id;
    if (!refundPaymentId) {
      return res.status(400).json({ success: false, message: 'Refund webhook is missing its payment reference.' });
    }
    try {
      refundPayment = await createRazorpayClient().payments.fetch(refundPaymentId);
      razorpayOrderId = refundPayment.order_id;
    } catch (error) {
      console.error('[Webhook] could not fetch refunded payment:', error.message);
      return res.status(400).json({ success: false, message: 'Refunded payment could not be verified.' });
    }
  }

  if (!razorpayOrderId) {
    return res.status(400).json({ success: false, message: 'Webhook is missing its Razorpay order reference.' });
  }

  const order = await Order.findOne({ razorpayOrderId });
  if (!order) {
    return res.status(404).json({ success: false, message: 'Linked internal order not found.' });
  }

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    if (!paymentEntity?.id) {
      return res.status(400).json({ success: false, message: 'Captured webhook is missing its payment reference.' });
    }
    let payment;
    try {
      payment = await createRazorpayClient().payments.fetch(paymentEntity.id);
    } catch (error) {
      console.error('[Webhook] Razorpay payment lookup failed for order:', order.internalOrderReference, error.message);
      return res.status(502).json({ success: false, message: 'Razorpay payment lookup failed; webhook may be retried.' });
    }
    try {
      await recordCapturedPayment(order, payment);
    } catch (error) {
      console.error('[Webhook] captured payment rejected for order:', order.internalOrderReference, error.message);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Webhook processing failed; webhook may be retried.',
      });
    }
  } else if (event.event === 'payment.failed') {
    if (
      paymentEntity?.order_id !== order.razorpayOrderId ||
      paymentEntity?.amount !== order.amountPaise ||
      paymentEntity?.currency !== order.currency
    ) {
      return res.status(400).json({ success: false, message: 'Failed payment does not match the internal order.' });
    }
    if (order.orderStatus !== 'paid' && order.orderStatus !== 'refunded') {
      order.orderStatus = 'failed';
      await order.save();
    }
    if (paymentEntity.id) {
      await Payment.updateOne(
        { razorpayPaymentId: paymentEntity.id },
        {
          $set: {
            orderReference: order.internalOrderReference,
            razorpayOrderId: order.razorpayOrderId,
            amountPaise: paymentEntity.amount,
            currency: paymentEntity.currency,
            status: 'failed',
            captured: false,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }
  } else if (isRefundEvent) {
    const refundAmountPaise = Number.isSafeInteger(refundPayment.amount_refunded)
      ? refundPayment.amount_refunded
      : refundEntity?.amount;
    if (
      refundPayment.order_id !== order.razorpayOrderId ||
      refundPayment.amount !== order.amountPaise ||
      refundPayment.currency !== order.currency ||
      !Number.isSafeInteger(refundAmountPaise) ||
      refundAmountPaise <= 0 ||
      refundAmountPaise > order.amountPaise
    ) {
      return res.status(400).json({ success: false, message: 'Refund does not match the internal order.' });
    }

    if (refundAmountPaise === order.amountPaise && order.orderStatus !== 'refunded') {
      order.orderStatus = 'refunded';
      await order.save();
    }
    await Payment.updateOne(
      { razorpayPaymentId: refundPayment.id },
      {
        $set: {
          orderReference: order.internalOrderReference,
          razorpayOrderId: order.razorpayOrderId,
          amountPaise: refundPayment.amount,
          refundAmountPaise,
          currency: refundPayment.currency,
          status: refundPayment.status,
          captured: refundPayment.captured === true,
        },
      },
      { upsert: true }
    );
    await Sale.updateOne(
      { internalOrderReference: order.internalOrderReference },
      {
        $set: {
          refundAmountPaise,
          netAmountPaise: order.amountPaise - refundAmountPaise,
          saleStatus: refundAmountPaise === order.amountPaise ? 'refunded' : 'paid',
        },
      }
    );
    console.log('[Webhook] refund verified for order:', order.internalOrderReference, 'refunded paise:', refundAmountPaise);
  } else {
    return res.json({ success: true, message: 'Webhook event acknowledged; no order change required.' });
  }

  try {
    await WebhookEvent.create({ eventId, eventType: event.event, processedAt: new Date() });
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
    console.log('[Webhook] duplicate event ignored:', eventId);
  }
  console.log('[Webhook] processed event:', event.event, 'internal order:', order.internalOrderReference);
  return res.json({ success: true, message: 'Webhook processed.' });
}

async function getProducts(req, res) {
  const products = await Product.find({ isPublished: true }).sort({ title: 1 });
  return res.json({ success: true, paymentMode: getRazorpayMode(), products: products.map(serializeProduct) });
}

async function getProductBySlugRoute(req, res) {
  const product = await Product.findOne({ slug: req.params.slug, isPublished: true });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }
  const paymentConfigured = isRazorpayConfigured();
  const pdfAvailable = Boolean(await findGridFSFile(product.gridFsFileId));
  return res.json({
    success: true,
    paymentMode: getRazorpayMode(),
    checkoutReady: paymentConfigured && pdfAvailable,
    paymentConfigured,
    pdfAvailable,
    product: serializeProduct(product),
  });
}

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentStatus,
  handleWebhook,
  getProducts,
  getProductBySlugRoute,
};
