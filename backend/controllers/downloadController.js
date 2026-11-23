const crypto = require('crypto');
const mongoose = require('mongoose');
const { findGridFSFile, getGridFSBucket } = require('../config/database');
const { DownloadToken, DownloadEvent, Order, Product } = require('../models');

async function handleSecureDownload(req, res) {
  const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const authorization = await DownloadToken.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
    $expr: { $lt: ['$downloadsUsed', '$maxDownloads'] },
  });

  if (!authorization) {
    console.log('[Download] authorization rejected: missing, expired, or exhausted token');
    return res.status(403).json({ success: false, message: 'Download authorization is invalid or expired.' });
  }
  console.log('[Download] authorization found for order:', authorization.internalOrderReference);

  const order = await Order.findOne({
    internalOrderReference: authorization.internalOrderReference,
    productId: authorization.productId,
    orderStatus: 'paid',
  });
  if (!order) {
    console.log('[Download] authorization rejected: order is not paid:', authorization.internalOrderReference);
    return res.status(403).json({ success: false, message: 'A verified, non-refunded payment is required to download this product.' });
  }

  const product = await Product.findOne({
    productId: order.productId,
    isPublished: true,
    gridFsFileId: { $type: 'objectId' },
  });
  if (!product || !mongoose.isValidObjectId(product.gridFsFileId)) {
    console.error('[Download] product has no valid GridFS ObjectId:', order.productId);
    return res.status(404).json({ success: false, message: 'The purchased PDF is unavailable.' });
  }

  const bucket = getGridFSBucket();
  const file = await findGridFSFile(product.gridFsFileId);
  if (!file) {
    console.error('[Download] GridFS file not found:', order.productId, product.gridFsFileId.toString());
    return res.status(404).json({ success: false, message: 'The purchased PDF is missing from secure storage.' });
  }

  const claimed = await DownloadToken.findOneAndUpdate(
    {
      _id: authorization._id,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$downloadsUsed', '$maxDownloads'] },
    },
    { $inc: { downloadsUsed: 1 } },
    { new: true }
  );
  if (!claimed) {
    return res.status(403).json({ success: false, message: 'Download authorization is invalid or its download limit has been reached.' });
  }

  const filename = `${product.productId}.pdf`;
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const event = {
    internalOrderReference: order.internalOrderReference,
    productId: product.productId,
    gridFsFileId: product.gridFsFileId,
  };
  await DownloadEvent.create({ ...event, outcome: 'started' });

  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  if (Number.isSafeInteger(file.length)) {
    res.setHeader('Content-Length', file.length);
  }

  const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(product.gridFsFileId));
  let streamFailed = false;
  downloadStream.once('error', (error) => {
    streamFailed = true;
    console.error('[GridFS] PDF stream failed for order:', order.internalOrderReference, error.message);
    DownloadEvent.create({ ...event, outcome: 'failed' }).catch((recordError) => {
      console.error('[Download] failed to record stream error:', recordError.message);
    });
    if (res.headersSent) {
      res.destroy(error);
    } else {
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Length');
      res.status(500).json({ success: false, message: 'The PDF could not be streamed.' });
    }
  });
  res.once('finish', () => {
    if (!streamFailed) {
      console.log('[GridFS] PDF stream completed for order:', order.internalOrderReference);
      DownloadEvent.create({ ...event, outcome: 'completed' }).catch((error) => {
        console.error('[Download] failed to record completion:', error.message);
      });
    }
  });
  res.once('close', () => {
    if (!res.writableEnded) {
      downloadStream.destroy();
    }
  });

  console.log('[GridFS] PDF stream started:', order.internalOrderReference, product.productId, product.gridFsFileId.toString());
  downloadStream.pipe(res);
}

module.exports = { handleSecureDownload };
