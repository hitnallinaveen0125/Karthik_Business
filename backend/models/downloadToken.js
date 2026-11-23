const mongoose = require('mongoose');

const downloadTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    internalOrderReference: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    maxDownloads: { type: Number, required: true },
    downloadsUsed: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.DownloadToken || mongoose.model('DownloadToken', downloadTokenSchema);
