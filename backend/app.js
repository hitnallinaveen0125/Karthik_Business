const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.join(__dirname, '.env') });
if (process.env.LOCAL_MONGODB_ONLY === 'true') {
  delete process.env.LOCAL_MONGODB_URI;
}

const publicRoutes = require('./routes/publicRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { getRazorpayMode, isRazorpayConfigured } = require('./config/razorpay');
const { getDatabaseMirrorStatus } = require('./config/database');

const app = express();
const clientOrigins = [
  ...(process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  'https://karthik-business-frontend.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
];

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  })
);

app.use(morgan('dev'));
app.use((req, res, next) => {
  res.setHeader('X-Database-Mirror-Status', getDatabaseMirrorStatus().state);
  next();
});
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  const mirrorStatus = getDatabaseMirrorStatus();
  res.json({
    ok: true,
    service: 'anantaora-backend',
    paymentMode: getRazorpayMode(),
    paymentsReady: isRazorpayConfigured(),
    databaseMirror: {
      enabled: mirrorStatus.enabled,
      state: mirrorStatus.state,
      lastSyncedAt: mirrorStatus.lastSyncedAt,
    },
  });
});

app.use('/api', publicRoutes);
app.use('/api/auth', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

module.exports = { app };
