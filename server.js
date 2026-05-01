const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const metaHandler = require("./api/meta");
const healthHandler = require("./api/health");
const checkVoucherHandler = require("./api/vouchers/check");
const redeemVoucherHandler = require("./api/vouchers/redeem");
const { loadEnvFile } = require("./lib/vouchers");

const PUBLIC_DIR = path.join(__dirname, "public");
const HOST = "0.0.0.0";

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

function sendStaticError(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify({ ok: false, message }));
}

function serveStatic(req, res) {
  const parsedPath = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedPath.pathname === "/" ? "/index.html" : parsedPath.pathname);
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!safePath.startsWith(PUBLIC_DIR)) {
    sendStaticError(res, 403, "Forbidden");
    return;
  }

  fs.readFile(safePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendStaticError(res, 404, "Not found");
        return;
      }

      sendStaticError(res, 500, "File error");
      return;
    }

    res.writeHead(200, { "Content-Type": getMimeType(safePath) });
    res.end(content);
  });
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

const routes = [
  { method: "GET", path: "/api/health", handler: healthHandler },
  { method: "GET", path: "/api/meta", handler: metaHandler },
  { method: "POST", path: "/api/vouchers/check", handler: checkVoucherHandler },
  { method: "POST", path: "/api/vouchers/redeem", handler: redeemVoucherHandler }
];

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const route = routes.find((item) => item.method === req.method && item.path === pathname);

  if (route) {
    try {
      await route.handler(req, res);
    } catch (error) {
      console.error("Server route error:", error);
      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
      }
      res.end(JSON.stringify({ ok: false, message: "Internal server error" }));
    }
    return;
  }

  serveStatic(req, res);
});

loadEnvFile();
const PORT = process.env.PORT || 3000;

server.listen(PORT, HOST, () => {
  console.log(`Voucher app disponible en http://localhost:${PORT}`);
  getLocalIpv4Addresses().forEach((address) => {
    console.log(`Disponible en tu red local: http://${address}:${PORT}`);
  });
});
