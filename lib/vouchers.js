const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "vouchers.json");
const REDEMPTIONS_FILE = path.join(DATA_DIR, "redemptions.json");
const REDEMPTION_KEY_PREFIX = "giftcard_magnum_redeemed:";
let redisClientPromise = null;

const RESTAURANTS = {
  de_botanas: "De Botanas",
  del_mon: "Del Mon"
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Missing data file: ${DATA_FILE}`);
  }
}

function loadSeedData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function loadMeta() {
  const data = loadSeedData();
  return data.meta;
}

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");

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

function useVercelKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useRedisRest() {
  return Boolean(
    (process.env.REDIS_REST_URL && process.env.REDIS_REST_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function runningOnVercel() {
  return Boolean(
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.NOW_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.cwd().includes("/var/task") ||
    __dirname.includes("/var/task") ||
    DATA_FILE.includes("/var/task")
  );
}

function getRedisUrl() {
  return (
    process.env.REDIS_URL ||
    process.env.STORAGE_REDIS_URL ||
    process.env.STORAGE_URL ||
    ""
  );
}

function useRedisUrl() {
  return Boolean(getRedisUrl());
}

function getRedisRestConfig() {
  return {
    url: process.env.REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""
  };
}

async function getRedisClient() {
  if (!useRedisUrl()) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = require("redis");
      const client = createClient({ url: getRedisUrl() });

      client.on("error", (error) => {
        console.error("Redis error", error);
      });

      if (!client.isOpen) {
        await client.connect();
      }

      return client;
    })();
  }

  return redisClientPromise;
}

async function runRedisRest(command) {
  const config = getRedisRestConfig();
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Redis REST request failed");
  }

  return payload.result;
}

async function runKvCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "KV request failed");
  }

  return payload.result;
}

function getRedemptionKey(code) {
  return `${REDEMPTION_KEY_PREFIX}${code}`;
}

function ensureRedemptionsFile() {
  ensureDataFile();

  if (!fs.existsSync(REDEMPTIONS_FILE)) {
    fs.writeFileSync(REDEMPTIONS_FILE, "{}");
  }
}

function loadLocalRedemptions() {
  ensureRedemptionsFile();
  return JSON.parse(fs.readFileSync(REDEMPTIONS_FILE, "utf8"));
}

function saveLocalRedemptions(redemptions) {
  ensureRedemptionsFile();
  fs.writeFileSync(REDEMPTIONS_FILE, JSON.stringify(redemptions, null, 2));
}

async function getRedemptionRecord(code) {
  const key = getRedemptionKey(code);

  if (useRedisRest()) {
    const stored = await runRedisRest(["GET", key]);
    return stored ? JSON.parse(stored) : null;
  }

  if (useRedisUrl()) {
    const client = await getRedisClient();
    const stored = await client.get(key);
    return stored ? JSON.parse(stored) : null;
  }

  if (useVercelKv()) {
    const stored = await runKvCommand(["GET", key]);
    return stored ? JSON.parse(stored) : null;
  }

  if (runningOnVercel()) {
    throw new Error("Falta configurar Redis o Vercel KV para guardar vouchers canjeados.");
  }

  const redemptions = loadLocalRedemptions();
  return redemptions[code] || null;
}

async function setRedemptionRecord(code, record) {
  const key = getRedemptionKey(code);
  const value = JSON.stringify(record);

  if (useRedisRest()) {
    await runRedisRest(["SET", key, value]);
    return;
  }

  if (useRedisUrl()) {
    const client = await getRedisClient();
    await client.set(key, value);
    return;
  }

  if (useVercelKv()) {
    await runKvCommand(["SET", key, value]);
    return;
  }

  if (runningOnVercel()) {
    throw new Error("Falta configurar Redis o Vercel KV para guardar vouchers canjeados.");
  }

  const redemptions = loadLocalRedemptions();
  redemptions[code] = record;
  saveLocalRedemptions(redemptions);
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

async function findVoucherByCode(code) {
  const normalizedCode = normalizeCode(code);
  const data = loadSeedData();
  const voucher = data.vouchers.find((item) => item.code === normalizedCode);

  if (!voucher) {
    return { meta: data.meta, voucher: null };
  }

  const redemption = await getRedemptionRecord(normalizedCode);

  if (redemption) {
    return {
      meta: data.meta,
      voucher: {
        ...voucher,
        status: "redeemed",
        redeemedAt: redemption.redeemedAt,
        redeemedRestaurant: redemption.redeemedRestaurant
      }
    };
  }

  return {
    meta: data.meta,
    voucher: {
      ...voucher,
      status: voucher.status || "active"
    }
  };
}

async function markVoucherRedeemed(code, restaurantKey) {
  const normalizedCode = normalizeCode(code);
  const { meta, voucher } = await findVoucherByCode(normalizedCode);

  if (!voucher) {
    return { meta, voucher: null };
  }

  if (voucher.status !== "active") {
    return { meta, voucher };
  }

  const redemption = {
    redeemedAt: new Date().toISOString(),
    redeemedRestaurant: restaurantKey
  };

  await setRedemptionRecord(normalizedCode, redemption);

  return {
    meta,
    voucher: {
      ...voucher,
      status: "redeemed",
      redeemedAt: redemption.redeemedAt,
      redeemedRestaurant: redemption.redeemedRestaurant
    }
  };
}

async function loadData() {
  const data = loadSeedData();
  const vouchers = [];

  for (const voucher of data.vouchers) {
    const found = await findVoucherByCode(voucher.code);
    vouchers.push(found.voucher);
  }

  return {
    meta: data.meta,
    vouchers
  };
}

async function saveData() {
  throw new Error("saveData ya no se usa. Usa markVoucherRedeemed para registrar canjes.");
}

function getWhatsappNumber() {
  return process.env.PUBLIC_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_TO || "";
}

function getPersistenceMode() {
  if (useRedisRest()) {
    return "redis-rest";
  }

  if (useRedisUrl()) {
    return "redis-url";
  }

  if (useVercelKv()) {
    return "vercel-kv";
  }

  if (runningOnVercel()) {
    return "missing-production-store";
  }

  return "local-file";
}

module.exports = {
  DATA_FILE,
  RESTAURANTS,
  findVoucherByCode,
  getTodayIso,
  getWhatsappNumber,
  isWithinValidity,
  loadData,
  loadEnvFile,
  loadMeta,
  getPersistenceMode,
  markVoucherRedeemed,
  normalizeCode,
  publicVoucher,
  saveData
};
