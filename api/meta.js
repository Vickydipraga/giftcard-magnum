const { sendJson } = require("../lib/http");
const { RESTAURANTS, getWhatsappNumber, loadData, loadEnvFile } = require("../lib/vouchers");

module.exports = async function handler(req, res) {
  loadEnvFile();

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  const data = await loadData();

  sendJson(res, 200, {
    amount: data.meta.amount,
    validFrom: data.meta.validFrom,
    validTo: data.meta.validTo,
    restaurants: RESTAURANTS,
    whatsappNumber: getWhatsappNumber()
  });
};
