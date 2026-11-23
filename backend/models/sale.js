const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    internalOrderReference: { type: String, required: true, unique: true, index: true },
    productId: { type: String, required: true },
    creatorId: { type: String, required: true },
    grossAmountPaise: { type: Number, required: true },
    refundAmountPaise: { type: Number, default: 0 },
    netAmountPaise: { type: Number, required: true },
    saleStatus: { type: String, enum: ['paid', 'refunded'], default: 'paid' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: 1 });

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
