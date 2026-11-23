const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    pricePaise: { type: Number, required: true, min: 1 },
    coverImage: { type: String, default: '' },
    creatorId: { type: String, required: true },
    creatorName: { type: String, required: true },
    publicationStatus: { type: String, default: 'published' },
    isPublished: { type: Boolean, default: false },
    fileName: { type: String, default: null },
    gridFsFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
