const mongoose = require("mongoose");
const logger = require("../utils/logger");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in .env");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);

  logger.info("MongoDB connected successfully.");

  mongoose.connection.on("error", (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected. Attempting to reconnect...");
  });

  return mongoose.connection;
}

module.exports = { connectDatabase };
