const crypto = require('crypto');
const { DownloadToken } = require('../models');

async function createDownloadTokenForOrder(order) {
  const token = crypto.randomBytes(32).toString('hex');
  await DownloadToken.create({
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    internalOrderReference: order.internalOrderReference,
    productId: order.productId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    maxDownloads: 3,
    downloadsUsed: 0,
  });
  return token;
}

module.exports = { createDownloadTokenForOrder };
