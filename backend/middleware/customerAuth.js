const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function requireCustomer(req, res, next) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(503).json({ success: false, message: 'Customer authentication is not configured on the server.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Sign in to continue.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded.role !== 'customer' || typeof decoded.sub !== 'string') {
      return res.status(403).json({ success: false, message: 'Customer access required.' });
    }

    const customer = await User.findById(decoded.sub);
    if (!customer) {
      return res.status(401).json({ success: false, message: 'This account is no longer available. Please sign in again.' });
    }
    req.customer = customer;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Your session expired. Please sign in again.' });
    }
    next(error);
  }
}

module.exports = { requireCustomer };
