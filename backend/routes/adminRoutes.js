const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { requireFounder } = require('../middleware/auth');
const { uploadProductPdf } = require('../controllers/productFileController');
const { Order, Product, Sale, User } = require('../models');
const { getDatabaseMirrorStatus } = require('../config/database');

const router = express.Router();
const INDIA_TIME_ZONE = 'Asia/Kolkata';
const INDIA_OFFSET_MILLISECONDS = 330 * 60 * 1000;
const PERIODS = {
  weekly: { title: 'This week', bucket: 'day' },
  monthly: { title: 'This month', bucket: 'day' },
  yearly: { title: 'This year', bucket: 'month' },
};

function getIndiaCalendarDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const partValues = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(partValues.year), Number(partValues.month) - 1, Number(partValues.day)));
}

function getPeriodStart(period, now = new Date()) {
  const start = getIndiaCalendarDate(now);
  if (period === 'weekly') {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  } else if (period === 'monthly') {
    start.setUTCDate(1);
  } else {
    start.setUTCMonth(0, 1);
  }
  return new Date(start.getTime() - INDIA_OFFSET_MILLISECONDS);
}

function getRevenueBuckets(period, start, now) {
  const buckets = [];
  const indiaStart = new Date(start.getTime() + INDIA_OFFSET_MILLISECONDS);
  const indiaNow = getIndiaCalendarDate(now);
  if (period === 'yearly') {
    for (let month = 0; month <= indiaNow.getUTCMonth(); month += 1) {
      const date = new Date(Date.UTC(indiaNow.getUTCFullYear(), month, 1));
      buckets.push({
        key: date.toISOString().slice(0, 7),
        label: date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
      });
    }
    return buckets;
  }

  for (const date = indiaStart; date <= indiaNow; date.setUTCDate(date.getUTCDate() + 1)) {
    buckets.push({
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    });
  }
  return buckets;
}

function toSafeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      callback(Object.assign(new Error('Upload a PDF file.'), { statusCode: 400 }));
      return;
    }
    callback(null, true);
  },
});

router.put('/products/:productId/pdf', requireFounder, pdfUpload.single('pdf'), uploadProductPdf);

router.get('/dashboard', requireFounder, async (req, res) => {
  const period = req.query.period === undefined ? 'weekly' : req.query.period;
  if (typeof period !== 'string' || !Object.hasOwn(PERIODS, period)) {
    return res.status(400).json({
      success: false,
      message: 'Choose a weekly, monthly, or yearly sales period.',
    });
  }

  const db = mongoose.connection.db;
  if (!db) {
    return res.status(503).json({ success: false, message: 'The database is not connected.' });
  }

  const now = new Date();
  const start = getPeriodStart(period, now);
  const dateFormat = PERIODS[period].bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const [periodSales, allTimeSales, periodOrders, totalCustomers, totalProducts, totalOrders, recentOrders, dbStats, collectionInfos] =
    await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: start, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$createdAt', timezone: INDIA_TIME_ZONE } },
            grossRevenuePaise: { $sum: '$grossAmountPaise' },
            refundsPaise: { $sum: '$refundAmountPaise' },
            netRevenuePaise: { $sum: '$netAmountPaise' },
            purchases: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.aggregate([
        {
          $group: {
            _id: null,
            grossRevenuePaise: { $sum: '$grossAmountPaise' },
            refundsPaise: { $sum: '$refundAmountPaise' },
            netRevenuePaise: { $sum: '$netAmountPaise' },
            purchases: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            orderStatus: { $in: ['paid', 'refunded'] },
            paidAt: { $gte: start, $lte: now },
          },
        },
        {
          $group: {
            _id: null,
            purchases: { $sum: 1 },
            customerIds: { $addToSet: '$customerId' },
          },
        },
        {
          $project: {
            purchases: 1,
            customers: {
              $size: {
                $filter: {
                  input: '$customerIds',
                  as: 'customerId',
                  cond: { $ne: ['$$customerId', null] },
                },
              },
            },
          },
        },
      ]),
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.find({ orderStatus: { $in: ['paid', 'refunded'] }, paidAt: { $ne: null } })
        .sort({ paidAt: -1 })
        .limit(10)
        .lean(),
      db.stats(),
      db.listCollections({}, { nameOnly: false }).toArray(),
    ]);

  const [collectionCounts, products] = await Promise.all([
    Promise.all(
      collectionInfos.map(async (collection) => ({
        name: collection.name,
        documents:
          collection.type === 'view'
            ? await db.collection(collection.name).countDocuments()
            : await db.collection(collection.name).estimatedDocumentCount(),
      }))
    ),
    Product.find().select('productId title').lean(),
  ]);
  const productTitles = new Map(products.map((product) => [product.productId, product.title]));
  const salesByBucket = new Map(periodSales.map((sale) => [sale._id, sale]));
  const buckets = getRevenueBuckets(period, start, now).map((bucket) => {
    const sale = salesByBucket.get(bucket.key);
    return {
      ...bucket,
      grossRevenuePaise: sale?.grossRevenuePaise || 0,
      refundsPaise: sale?.refundsPaise || 0,
      netRevenuePaise: sale?.netRevenuePaise || 0,
      purchases: sale?.purchases || 0,
    };
  });
  const allTime = allTimeSales[0] || {};
  const selectedPeriod = periodOrders[0] || {};

  return res.json({
    success: true,
    dashboard: {
      period,
      periodTitle: PERIODS[period].title,
      startDate: start,
      endDate: now,
      sales: {
        period: {
          customers: toSafeCount(selectedPeriod.customers),
          purchases: toSafeCount(selectedPeriod.purchases),
          grossRevenuePaise: toSafeCount(
            periodSales.reduce((total, sale) => total + sale.grossRevenuePaise, 0)
          ),
          refundsPaise: toSafeCount(periodSales.reduce((total, sale) => total + sale.refundsPaise, 0)),
          netRevenuePaise: toSafeCount(
            periodSales.reduce((total, sale) => total + sale.netRevenuePaise, 0)
          ),
        },
        allTime: {
          customers: await Order.distinct('customerId', {
            orderStatus: { $in: ['paid', 'refunded'] },
            customerId: { $ne: null },
          }).then((customerIds) => customerIds.length),
          purchases: toSafeCount(allTime.purchases),
          grossRevenuePaise: toSafeCount(allTime.grossRevenuePaise),
          refundsPaise: toSafeCount(allTime.refundsPaise),
          netRevenuePaise: toSafeCount(allTime.netRevenuePaise),
        },
        totalCustomers,
        totalProducts,
        totalOrders,
        buckets,
      },
      recentOrders: recentOrders.map((order) => ({
        orderReference: order.internalOrderReference,
        productTitle: productTitles.get(order.productId) || 'Purchased product',
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        amountPaise: order.amountPaise,
        currency: order.currency,
        status: order.orderStatus,
        paidAt: order.paidAt,
      })),
      database: {
        connected: true,
        name: mongoose.connection.name,
        mirror: getDatabaseMirrorStatus(),
        collections: collectionCounts,
        collectionCount: toSafeCount(dbStats.collections),
        dataSizeBytes: toSafeCount(dbStats.dataSize),
        storageSizeBytes: toSafeCount(dbStats.storageSize),
      },
    },
  });
});

module.exports = router;
module.exports.getPeriodStart = getPeriodStart;
module.exports.getRevenueBuckets = getRevenueBuckets;
