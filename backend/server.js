const { app } = require('./app');
const { connectMongo } = require('./config/database');

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST;

async function startServer() {
  try {
    await connectMongo();
    app.listen(PORT, HOST, () => {
      console.log(`ANANTAORA backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
