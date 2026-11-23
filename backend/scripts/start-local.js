if (process.env.NODE_ENV === 'production') {
  throw new Error('Use "npm start" with explicit production configuration.');
}

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

if (process.argv.includes('--local-db')) {
  process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${process.env.MONGODB_DATABASE || 'anantaora'}`;
  process.env.LOCAL_MONGODB_ONLY = 'true';
  delete process.env.LOCAL_MONGODB_URI;
}

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/anantaora';
}
if (!process.env.RAZORPAY_MODE) {
  process.env.RAZORPAY_MODE = 'test';
}
if (!process.env.HOST) {
  process.env.HOST = '127.0.0.1';
}

require('../server');
