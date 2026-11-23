const express = require('express');
const jwt = require('jsonwebtoken');
const { getProducts, getProductBySlugRoute } = require('../controllers/paymentController');
const { handleSecureDownload } = require('../controllers/downloadController');

const router = express.Router();

router.get('/products', getProducts);
router.get('/products/:slug', getProductBySlugRoute);
router.get('/download/:token', handleSecureDownload);

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  const founderEmail = process.env.FOUNDER_EMAIL;
  const founderPassword = process.env.FOUNDER_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;
  if (!founderEmail || !founderPassword || !jwtSecret) {
    return res.status(503).json({ success: false, message: 'Founder authentication is not configured on the server.' });
  }

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalizedEmail !== founderEmail.trim().toLowerCase() || password !== founderPassword) {
    return res.status(401).json({ success: false, message: 'Invalid founder credentials.' });
  }

  const token = jwt.sign(
    { sub: 'founder', role: 'founder', email: founderEmail },
    jwtSecret,
    { expiresIn: '8h' }
  );

  return res.json({
    success: true,
    token,
    user: {
      name: 'Founder',
      email: founderEmail,
      role: 'founder',
    },
  });
});

module.exports = router;
