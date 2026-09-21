const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('\x1b[33m%s\x1b[0m', 'ℹ️  MONGODB_URI not found in .env. Server will run with file-system local cache mode.');
    console.log('\x1b[36m%s\x1b[0m', '👉 To connect your MongoDB, add MONGODB_URI in .env file (e.g. mongodb+srv://user:pass@cluster.mongodb.net/aktu_app_db)');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    isConnected = true;
    console.log('\x1b[32m%s\x1b[0m', `✅ MongoDB Connected Successfully: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `⚠️ MongoDB Connection Warning: ${error.message}`);
    console.log('\x1b[33m%s\x1b[0m', 'ℹ️  Running in Local Storage Cache Mode until MongoDB Atlas is reached.');
    isConnected = false;
    return false;
  }
};

const getStatus = () => isConnected;

module.exports = { connectDB, getStatus };
