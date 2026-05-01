const { sendJson } = require("../lib/http");
const { getPersistenceMode, loadEnvFile, loadMeta } = require("../lib/vouchers");

module.exports = async function handler(req, res) {
  loadEnvFile();

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const meta = loadMeta();
  const persistenceMode = getPersistenceMode();

  sendJson(res, 200, {
    ok: true,
    persistenceMode,
    readyForProduction: persistenceMode !== "missing-production-store",
    validFrom: meta.validFrom,
    validTo: meta.validTo
  });
};
