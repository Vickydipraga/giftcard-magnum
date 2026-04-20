const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataPath = path.join(__dirname, "..", "data", "vouchers.json");
const quantity = Number(process.argv[2] || 10);

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function randomCode(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

const raw = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(raw);

for (let index = 1; index <= quantity; index += 1) {
  const name = `Cliente ${index}`;
  const prefix = slugify(`MAGNUM ${name} 2026`);

  data.vouchers.push({
    code: randomCode(prefix),
    customerName: name,
    customerPhone: "",
    status: "active",
    redeemedAt: null,
    redeemedRestaurant: null,
    notificationId: null
  });
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`Se agregaron ${quantity} vouchers en ${dataPath}`);
