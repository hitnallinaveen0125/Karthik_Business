const mongoose = require('mongoose');

const downloadEventSchema = new mongoose.Schema(
  {
    internalOrderReference: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    outcome: { type: String, enum: ['started', 'completed', 'failed'], required: true },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.DownloadEvent || mongoose.model('DownloadEvent', downloadEventSchema);
