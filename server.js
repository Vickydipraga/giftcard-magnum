const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "vouchers.json");
const HOST = "0.0.0.0";
const VALID_FROM = "2026-05-01";
const VALID_TO = "2026-06-30";
const AMOUNT = 60000;
const RESTAURANTS = {
  de_botanas: "De Botanas",
  del_mon: "Del Mon"
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      meta: {
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        amount: AMOUNT,
        currency: "ARS"
      },
      vouchers: [
        {
          code: "MAGNUM-ANA-2026",
          customerName: "Ana Perez",
          customerPhone: "",
          status: "active",
          redeemedAt: null,
          redeemedRestaurant: null,
          notificationId: null
        },
        {
          code: "MAGNUM-LUCA-2026",
          customerName: "Luca Gomez",
          customerPhone: "",
          status: "active",
          redeemedAt: null,
          redeemedRestaurant: null,
          notificationId: null
        }
      ]
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

function loadData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    });
  });

  return addresses;
}

function isWithinValidity(today, validFrom, validTo) {
  return today >= validFrom && today <= validTo;
}

function publicVoucher(voucher, meta) {
  return {
    code: voucher.code,
    customerName: voucher.customerName,
    customerPhone: voucher.customerPhone,
    status: voucher.status,
    redeemedAt: voucher.redeemedAt,
    redeemedRestaurant: voucher.redeemedRestaurant,
    amount: meta.amount,
    validFrom: meta.validFrom,
    validTo: meta.validTo,
    restaurants: RESTAURANTS
  };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return types[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const parsedPath = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedPath.pathname === "/" ? "/index.html" : parsedPath.pathname);
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!safePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(safePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      sendJson(res, 500, { error: "File error" });
      return;
    }

    res.writeHead(200, { "Content-Type": getMimeType(safePath) });
    res.end(content);
  });
}

function buildWhatsappMessage(voucher, restaurantName) {
  const customerLabel = voucher.customerName || "Cliente sin nombre";
  const when = new Date().toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  });

  return [
    "Voucher canjeado",
    `Cliente: ${customerLabel}`,
    `Codigo: ${voucher.code}`,
    `Restaurante: ${restaurantName}`,
    `Monto: $${AMOUNT.toLocaleString("es-AR")}`,
    `Fecha: ${when}`
  ].join("\n");
}

async function notifyWhatsapp(voucher, restaurantName) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  const toNumber = process.env.TWILIO_WHATSAPP_TO;

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    return {
      sent: false,
      reason: "missing_twilio_env"
    };
  }

  const message = buildWhatsappMessage(voucher, restaurantName);
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNumber}`,
    Body: message
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Twilio request failed");
  }

  return {
    sent: true,
    sid: payload.sid
  };
}

async function handleCheckVoucher(req, res) {
  try {
    const body = await readRequestBody(req);
    const code = normalizeCode(body.code);
    const data = loadData();
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
}

async function handleRedeemVoucher(req, res) {
  try {
    const body = await readRequestBody(req);
    const code = normalizeCode(body.code);
    const restaurantKey = String(body.restaurant || "").trim();
    const fallbackCustomerName = String(body.customerName || "").trim();
    const data = loadData();
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

    let notification = { sent: false, reason: "not_attempted" };

    try {
      notification = await notifyWhatsapp(voucher, RESTAURANTS[restaurantKey]);
      voucher.notificationId = notification.sid || null;
    } catch (error) {
      voucher.notificationError = error.message;
    }

    saveData(data);

    sendJson(res, 200, {
      ok: true,
      message: "Voucher canjeado con exito.",
      voucher: publicVoucher(voucher, data.meta),
      notification
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: error.message
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/vouchers/check") {
    await handleCheckVoucher(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/vouchers/redeem") {
    await handleRedeemVoucher(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/meta") {
    const data = loadData();
    sendJson(res, 200, {
      amount: data.meta.amount,
      validFrom: data.meta.validFrom,
      validTo: data.meta.validTo,
      restaurants: RESTAURANTS,
      whatsappNumber: process.env.PUBLIC_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_TO || ""
    });
    return;
  }

  serveStatic(req, res);
});

loadEnvFile();
const PORT = process.env.PORT || 3000;
ensureDataFile();

server.listen(PORT, HOST, () => {
  console.log(`Voucher app disponible en http://localhost:${PORT}`);
  getLocalIpv4Addresses().forEach((address) => {
    console.log(`Disponible en tu red local: http://${address}:${PORT}`);
  });
});
