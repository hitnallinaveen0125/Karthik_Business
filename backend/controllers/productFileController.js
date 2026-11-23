const { findGridFSFile, getGridFSBucket } = require('../config/database');
const { Product } = require('../models');

async function uploadProductPdf(req, res) {
  const product = await Product.findOne({ productId: req.params.productId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }
  if (!req.file || !req.file.buffer || req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ success: false, message: 'Upload a valid PDF file.' });
  }

  const bucket = getGridFSBucket();
  const previousFileId = product.gridFsFileId;
  const filename = `${product.productId}.pdf`;
  const uploadStream = bucket.openUploadStream(filename, {
    contentType: 'application/pdf',
    metadata: { productId: product.productId },
  });

  try {
    await new Promise((resolve, reject) => {
      uploadStream.once('error', reject);
      uploadStream.once('finish', resolve);
      uploadStream.end(req.file.buffer);
    });
    if (!(await findGridFSFile(uploadStream.id))) {
      throw new Error('GridFS upload completed without all expected chunks.');
    }
    product.gridFsFileId = uploadStream.id;
    product.fileName = filename;
    await product.save();
  } catch (error) {
    if (uploadStream.id) {
      await bucket.delete(uploadStream.id).catch((cleanupError) => {
        console.error('[GridFS] failed upload cleanup:', cleanupError.message);
      });
    }
    throw error;
  }

  if (previousFileId) {
    try {
      await bucket.delete(previousFileId);
    } catch (error) {
      console.error('[GridFS] old PDF cleanup failed:', error.message);
    }
  }

  console.log('[GridFS] uploaded PDF for product:', product.productId, 'file:', uploadStream.id.toString());
  return res.json({ success: true, message: 'Product PDF uploaded to private GridFS storage.' });
}

module.exports = { uploadProductPdf };
