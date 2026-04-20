const { readJsonBody, sendJson } = require("../../lib/http");
const { loadData, loadEnvFile, normalizeCode, publicVoucher } = require("../../lib/vouchers");

module.exports = async function handler(req, res) {
  loadEnvFile();

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const code = normalizeCode(body.code);
    const data = await loadData();
    const voucher = data.vouchers.find((item) => item.code === code);

    if (!voucher) {
      sendJson(res, 404, {
        ok: false,
        message: "El codigo no existe."
      });
      return;
    }

    if (voucher.status !== "active") {
      sendJson(res, 409, {
        ok: false,
        message: "Este voucher ya fue canjeado o esta inactivo.",
        voucher: publicVoucher(voucher, data.meta)
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      voucher: publicVoucher(voucher, data.meta)
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: error.message
    });
  }
};
