const mongoose = require("mongoose");
const logger = require("../utils/logger");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI não está definido no .env");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);

  logger.info("MongoDB ligado com sucesso.");

  mongoose.connection.on("error", (err) => {
    logger.error(`Erro de ligação MongoDB: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB desligado. A tentar reconectar...");
  });

  return mongoose.connection;
}

module.exports = { connectDatabase };
