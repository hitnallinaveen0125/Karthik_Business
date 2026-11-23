const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    internalOrderReference: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    creatorId: { type: String, required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    orderStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    createdAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ orderStatus: 1, paidAt: -1 });
orderSchema.index({ orderStatus: 1, customerId: 1 });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
