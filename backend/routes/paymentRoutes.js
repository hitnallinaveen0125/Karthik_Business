const express = require('express');
const { createRazorpayOrder, verifyRazorpayPayment, getPaymentStatus, handleWebhook } = require('../controllers/paymentController');
const { requireCustomer } = require('../middleware/customerAuth');

const router = express.Router();

router.post('/create-order', requireCustomer, createRazorpayOrder);
router.post('/verify', requireCustomer, verifyRazorpayPayment);
router.post('/webhook', handleWebhook);
router.get('/status/:orderId', getPaymentStatus);

module.exports = router;
