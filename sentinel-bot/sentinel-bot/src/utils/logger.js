function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (msg) => console.log(`[${timestamp()}] [INFO] ${msg}`),
  warn: (msg) => console.warn(`[${timestamp()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${timestamp()}] [ERROR] ${msg}`),
  debug: (msg) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[${timestamp()}] [DEBUG] ${msg}`);
    }
  }
};
