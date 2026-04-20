const crypto = require("crypto");
const { readJsonBody, sendJson } = require("../../lib/http");
const {
  RESTAURANTS,
  getTodayIso,
  isWithinValidity,
  loadData,
  loadEnvFile,
  normalizeCode,
  publicVoucher,
  saveData
} = require("../../lib/vouchers");

module.exports = async function handler(req, res) {
  loadEnvFile();

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const code = normalizeCode(body.code);
    const restaurantKey = String(body.restaurant || "").trim();
    const fallbackCustomerName = String(body.customerName || "").trim();
    const data = await loadData();
    const voucher = data.vouchers.find((item) => item.code === code);

    if (!voucher) {
      sendJson(res, 404, {
        ok: false,
        message: "El codigo no existe."
      });
      return;
    }

    if (!RESTAURANTS[restaurantKey]) {
      sendJson(res, 400, {
        ok: false,
        message: "Selecciona un restaurante valido."
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

    const today = getTodayIso();

    if (!isWithinValidity(today, data.meta.validFrom, data.meta.validTo)) {
      sendJson(res, 403, {
        ok: false,
        message: `Este voucher solo puede canjearse del ${data.meta.validFrom} al ${data.meta.validTo}.`
      });
      return;
    }

    if (!voucher.customerName && fallbackCustomerName) {
      voucher.customerName = fallbackCustomerName;
    }

    voucher.status = "redeemed";
    voucher.redeemedAt = new Date().toISOString();
    voucher.redeemedRestaurant = restaurantKey;
    voucher.redemptionToken = crypto.randomUUID();

    await saveData(data);

    sendJson(res, 200, {
      ok: true,
      message: "Voucher canjeado con exito.",
      voucher: publicVoucher(voucher, data.meta),
      notification: {
        sent: false,
        reason: "manual_whatsapp_redirect"
      }
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: error.message
    });
  }
};
