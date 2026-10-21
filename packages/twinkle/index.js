require("dotenv").config();
require("./bootstrap");
require("./utils/core");

const { loadDir } = require("./utils/loader");
const { generateClientLoader } = require("./clientLoaderGenerator");
const { initializeDatabases } = require("./database/bootstrap.js");

(async () => {
  try {
    await initializeDatabases();
    require("./systems/adminBridge/registry-runtime.js").install();

    loadDir(__dirname, {
      exclude: ["utils", "database", "maps", "bootstrap.js"],
      recursive: true
    });

    generateClientLoader();

    console.log("[TWINKLE] Package loaded");
  } catch (err) {
    console.error("[TWINKLE] Startup aborted because database bootstrap failed:", err);
    process.exit(1);
  }
})();
