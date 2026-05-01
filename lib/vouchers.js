const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "vouchers.json");
const VOUCHERS_KV_KEY = "giftcard_magnum_vouchers";
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
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  );
}

function useRedisUrl() {
  return Boolean(getRedisUrl());
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

async function loadData() {
  if (useRedisUrl()) {
    const client = await getRedisClient();
    const stored = await client.get(VOUCHERS_KV_KEY);

    if (!stored) {
      const seed = loadSeedData();
      await saveData(seed);
      return seed;
    }

    return JSON.parse(stored);
  }

  if (runningOnVercel()) {
    if (!useVercelKv()) {
      return loadSeedData();
    }
  }

  if (!useVercelKv()) {
    ensureDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }

  const stored = await runKvCommand(["GET", VOUCHERS_KV_KEY]);

  if (!stored) {
    const seed = loadSeedData();
    await saveData(seed);
    return seed;
  }

  return JSON.parse(stored);
}

async function saveData(data) {
  if (useRedisUrl()) {
    const client = await getRedisClient();
    await client.set(VOUCHERS_KV_KEY, JSON.stringify(data));
    return;
  }

  if (runningOnVercel()) {
    if (useVercelKv()) {
      await runKvCommand(["SET", VOUCHERS_KV_KEY, JSON.stringify(data)]);
      return;
    }

    throw new Error("Falta configurar Redis o Vercel KV para guardar vouchers canjeados.");
  }

  if (!useVercelKv()) {
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return;
  }

  await runKvCommand(["SET", VOUCHERS_KV_KEY, JSON.stringify(data)]);
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

function getWhatsappNumber() {
  return process.env.PUBLIC_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_TO || "";
}

module.exports = {
  DATA_FILE,
  RESTAURANTS,
  getTodayIso,
  getWhatsappNumber,
  isWithinValidity,
  loadData,
  loadEnvFile,
  normalizeCode,
  publicVoucher,
  saveData
};
