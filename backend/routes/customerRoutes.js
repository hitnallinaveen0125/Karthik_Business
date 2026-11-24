const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Order, Product } = require('../models');
const { requireCustomer } = require('../middleware/customerAuth');
const { createDownloadTokenForOrder } = require('../utils/downloadTokens');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (user) => ({ id: user._id.toString(), name: user.name, email: user.email, role: 'customer' });

function createCustomerToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function createAdminToken(email) {
  return jwt.sign({ sub: 'founder', role: 'admin', email }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (
    !normalizedName ||
    normalizedName.length > 100 ||
    !emailPattern.test(normalizedEmail) ||
    typeof password !== 'string' ||
    Buffer.byteLength(password, 'utf8') < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      success: false,
      message: 'Enter your name, a valid email, and a password between 8 and 72 bytes.',
    });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, message: 'Customer authentication is not configured on the server.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await User.create({ name: normalizedName, email: normalizedEmail, passwordHash });
    return res.status(201).json({ success: true, token: createCustomerToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }
    throw error;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!emailPattern.test(normalizedEmail) || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'Enter a valid email and password.' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, message: 'Customer authentication is not configured on the server.' });
  }

  const founderEmail = process.env.FOUNDER_EMAIL;
  const founderPassword = process.env.FOUNDER_PASSWORD;
  if (
    founderEmail &&
    founderPassword &&
    normalizedEmail === founderEmail.trim().toLowerCase() &&
    password === founderPassword
  ) {
    return res.json({
      success: true,
      token: createAdminToken(founderEmail),
      user: { id: 'founder', name: 'Founder', email: founderEmail, role: 'admin' },
    });
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
  }
  return res.json({ success: true, token: createCustomerToken(user), user: publicUser(user) });
});

router.get('/me', requireCustomer, (req, res) => {
  return res.json({ success: true, user: publicUser(req.customer) });
});

router.get('/purchases', requireCustomer, async (req, res) => {
  const orders = await Order.find({ customerId: req.customer._id, orderStatus: 'paid' }).sort({ paidAt: -1 });
  const productIds = [...new Set(orders.map((order) => order.productId))];
  const products = await Product.find({ productId: { $in: productIds } });
  const productById = new Map(products.map((product) => [product.productId, product]));

  return res.json({
    success: true,
    purchases: orders.map((order) => {
      const product = productById.get(order.productId);
      return {
        orderId: order.internalOrderReference,
        productId: order.productId,
        title: product?.title || 'Purchased product',
        slug: product?.slug || null,
        amountPaise: order.amountPaise,
        currency: order.currency,
        paidAt: order.paidAt,
      };
    }),
  });
});

router.post('/purchases/:orderId/download', requireCustomer, async (req, res) => {
  const order = await Order.findOne({
    internalOrderReference: req.params.orderId,
    customerId: req.customer._id,
    orderStatus: 'paid',
  });
  if (!order) {
    return res.status(404).json({ success: false, message: 'A paid purchase for this account was not found.' });
  }

  const product = await Product.findOne({ productId: order.productId, isPublished: true });
  if (!product) {
    return res.status(404).json({ success: false, message: 'The purchased product is unavailable.' });
  }

  const downloadToken = await createDownloadTokenForOrder(order);
  return res.json({
    success: true,
    downloadUrl: `/api/download/${downloadToken}`,
    downloadToken,
  });
});

module.exports = router;
