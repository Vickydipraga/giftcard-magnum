const { readJsonBody, sendJson } = require("../../lib/http");
const {
  RESTAURANTS,
  findVoucherByCode,
  getTodayIso,
  isWithinValidity,
  loadEnvFile,
  markVoucherRedeemed,
  normalizeCode,
  publicVoucher
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
    const { meta, voucher } = await findVoucherByCode(code);

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
        voucher: publicVoucher(voucher, meta)
      });
      return;
    }

    const today = getTodayIso();

    if (!isWithinValidity(today, meta.validFrom, meta.validTo)) {
      sendJson(res, 403, {
        ok: false,
        message: `Este voucher solo puede canjearse del ${meta.validFrom} al ${meta.validTo}.`
      });
      return;
    }

    const redeemedResult = await markVoucherRedeemed(code, restaurantKey);

    sendJson(res, 200, {
      ok: true,
      message: "Voucher canjeado con exito.",
      voucher: publicVoucher(redeemedResult.voucher, meta),
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
