const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    razorpayPaymentId: { type: String, required: true, unique: true, index: true },
    razorpayOrderId: { type: String, required: true, index: true },
    orderReference: { type: String, required: true, index: true },
    amountPaise: { type: Number, required: true },
    refundAmountPaise: { type: Number, default: 0 },
    currency: { type: String, required: true },
    status: { type: String, required: true },
    captured: { type: Boolean, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
