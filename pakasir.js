// ==========================================
//  PAKASIR.JS - Pakasir API Wrapper
//  ✅ Sesuai dokumentasi resmi Pakasir
//  https://app.pakasir.com
// ==========================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const QRCode = require("qrcode");
const config = require("./config");

// ==========================================
// PATH DATABASE
// ==========================================
const ORDERS_DB_PATH = path.join(__dirname, "database", "orders.json");

// ==========================================
// ORDER DATABASE FUNCTIONS
// ==========================================

function ensureDir() {
  const dir = path.dirname(ORDERS_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadOrders() {
  try {
    ensureDir();
    if (!fs.existsSync(ORDERS_DB_PATH)) {
      fs.writeFileSync(ORDERS_DB_PATH, "[]");
      return [];
    }
    return JSON.parse(fs.readFileSync(ORDERS_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  ensureDir();
  fs.writeFileSync(ORDERS_DB_PATH, JSON.stringify(orders, null, 2));
}

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

function createOrder(data) {
  const orders = loadOrders();
  const order = {
    orderId: generateOrderId(),
    serviceId: data.serviceId,
    serviceName: data.serviceName,
    amount: data.amount,
    fee: 0,
    totalPayment: data.amount,
    buyerJid: data.buyerJid,
    buyerNumber: data.buyerNumber,
    buyerName: data.buyerName,
    paymentMethod: config.pakasir.paymentMethod,
    paymentNumber: null, // QR string atau VA number
    expiredAt: null, // dari Pakasir
    status: "pending", // pending | completed | expired | failed | cancelled
    createdAt: new Date().toISOString(),
    completedAt: null,
    notifiedBuyer: false,
    notifiedSeller: false,
  };
  orders.push(order);
  saveOrders(orders);
  console.log(
    `📦 Order created: ${order.orderId} | ${order.serviceName} | ${order.amount}`,
  );
  return order;
}

function updateOrder(orderId, updates) {
  const orders = loadOrders();
  const index = orders.findIndex((o) => o.orderId === orderId);
  if (index === -1) return null;
  orders[index] = { ...orders[index], ...updates };
  saveOrders(orders);
  return orders[index];
}

function findOrderById(orderId) {
  return loadOrders().find((o) => o.orderId === orderId) || null;
}

function findOrderByOrderId(orderId) {
  return loadOrders().find((o) => o.orderId === orderId) || null;
}

function getPendingOrderByBuyer(buyerNumber) {
  return loadOrders().find(
    (o) => o.buyerNumber === buyerNumber && o.status === "pending",
  );
}

function getExpiredOrders() {
  const now = new Date();
  return loadOrders().filter(
    (o) =>
      o.status === "pending" && o.expiredAt && new Date(o.expiredAt) <= now,
  );
}

function getAllOrders(limit = 20) {
  return loadOrders().slice(-limit).reverse();
}

// ==========================================
// HTTP REQUEST HELPER
// ==========================================
function httpRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      ...options,
    };

    console.log(`🌐 ${requestOptions.method || "GET"} → ${url}`);

    const req = lib.request(requestOptions, (res) => {
      let data = "";

      // Handle redirect
      if (
        [301, 302, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        console.log(`↪️  Redirect → ${res.headers.location}`);
        httpRequest(res.headers.location, options, postData)
          .then(resolve)
          .catch(reject);
        return;
      }

      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout (30s)"));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// ==========================================
// ✅ API: Transaction Create
// POST https://app.pakasir.com/api/transactioncreate/{method}
//
// Body:
// {
//   "project": "jasapembuatanweb",
//   "order_id": "ORD-XXXXX",
//   "amount": 1400000,
//   "api_key": "xxx"
// }
//
// Response:
// {
//   "payment": {
//     "project": "jasapembuatanweb",
//     "order_id": "ORD-XXXXX",
//     "amount": 1400000,
//     "fee": 1003,
//     "total_payment": 1401003,
//     "payment_method": "qris",
//     "payment_number": "00020101021226...",  ← QR string
//     "expired_at": "2025-09-19T01:18:49Z"
//   }
// }
// ==========================================
async function createTransaction(orderId, amount, method) {
  const { baseUrl, project, apiKey } = config.pakasir;

  // Tentukan payment method
  const paymentMethod = method || config.pakasir.paymentMethod || "qris";

  const url = `${baseUrl}/api/transactioncreate/${paymentMethod}`;

  const body = JSON.stringify({
    project: project,
    order_id: orderId,
    amount: amount,
    api_key: apiKey,
  });

  console.log(`\n💳 ═══════════════════════════════════════`);
  console.log(`💳 Pakasir Transaction Create`);
  console.log(`💳 URL: ${url}`);
  console.log(`💳 Project: ${project}`);
  console.log(`💳 Order ID: ${orderId}`);
  console.log(`💳 Amount: ${amount}`);
  console.log(`💳 Method: ${paymentMethod}`);
  console.log(`💳 ═══════════════════════════════════════\n`);

  try {
    const response = await httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      body,
    );

    console.log(
      `📥 Response (${response.status}):`,
      JSON.stringify(response.data, null, 2),
    );

    if (
      response.status >= 200 &&
      response.status < 300 &&
      response.data?.payment
    ) {
      return {
        success: true,
        payment: response.data.payment,
      };
    } else {
      // Error response
      const errMsg =
        typeof response.data === "object"
          ? response.data.message ||
            response.data.error ||
            JSON.stringify(response.data)
          : String(response.data);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errMsg}`,
        raw: response.data,
      };
    }
  } catch (err) {
    console.error(`❌ Pakasir API error:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

// ==========================================
// ✅ API: Transaction Detail
// GET https://app.pakasir.com/api/transactiondetail
//     ?project={slug}&amount={amount}&order_id={order_id}&api_key={api_key}
//
// Response:
// {
//   "transaction": {
//     "amount": 22000,
//     "order_id": "ORD-XXXXX",
//     "project": "jasapembuatanweb",
//     "status": "completed",
//     "payment_method": "qris",
//     "completed_at": "2024-09-10T08:07:02.819+07:00"
//   }
// }
// ==========================================
async function getTransactionDetail(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const url =
    `${baseUrl}/api/transactiondetail` +
    `?project=${encodeURIComponent(project)}` +
    `&amount=${amount}` +
    `&order_id=${encodeURIComponent(orderId)}` +
    `&api_key=${encodeURIComponent(apiKey)}`;

  console.log(`🔍 Transaction Detail: ${orderId} (${amount})`);

  try {
    const response = await httpRequest(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (
      response.status >= 200 &&
      response.status < 300 &&
      response.data?.transaction
    ) {
      return {
        success: true,
        transaction: response.data.transaction,
      };
    } else {
      return {
        success: false,
        error:
          typeof response.data === "object"
            ? response.data.message || JSON.stringify(response.data)
            : String(response.data),
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==========================================
// ✅ API: Payment Simulation (Sandbox)
// POST https://app.pakasir.com/api/paymentsimulation
//
// Body:
// {
//   "project": "jasapembuatanweb",
//   "order_id": "ORD-XXXXX",
//   "amount": 1400000,
//   "api_key": "xxx"
// }
// ==========================================
async function simulatePayment(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const url = `${baseUrl}/api/paymentsimulation`;

  const body = JSON.stringify({
    project: project,
    order_id: orderId,
    amount: amount,
    api_key: apiKey,
  });

  console.log(`🧪 Simulating payment: ${orderId} (${amount})`);

  try {
    const response = await httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      body,
    );

    console.log(`🧪 Simulation response:`, response.data);

    return {
      success: response.status >= 200 && response.status < 300,
      data: response.data,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==========================================
// ✅ API: Transaction Cancel
// POST https://app.pakasir.com/api/transactioncancel
// ==========================================
async function cancelTransaction(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const url = `${baseUrl}/api/transactioncancel`;

  const body = JSON.stringify({
    project: project,
    order_id: orderId,
    amount: amount,
    api_key: apiKey,
  });

  console.log(`🚫 Cancelling transaction: ${orderId}`);

  try {
    const response = await httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
      body,
    );

    return {
      success: response.status >= 200 && response.status < 300,
      data: response.data,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==========================================
// ✅ GENERATE QR IMAGE dari QR String
// Pakasir mengembalikan QR string, bukan gambar
// Kita convert string → gambar PNG buffer
// ==========================================
async function generateQRImage(qrString) {
  try {
    const buffer = await QRCode.toBuffer(qrString, {
      type: "png",
      width: 512,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
    });
    console.log(`✅ QR Image generated (${buffer.length} bytes)`);
    return buffer;
  } catch (err) {
    console.error(`❌ QR generation error:`, err.message);
    return null;
  }
}

// ==========================================
// ✅ GENERATE PAYMENT URL (Integrasi Via URL)
// https://app.pakasir.com/pay/{slug}/{amount}?order_id={order_id}&qris_only=1
// ==========================================
function getPaymentUrl(orderId, amount, qrisOnly = true) {
  const { baseUrl, project } = config.pakasir;
  let url = `${baseUrl}/pay/${project}/${amount}?order_id=${encodeURIComponent(orderId)}`;
  if (qrisOnly) url += "&qris_only=1";
  return url;
}

// ==========================================
// FORMAT HELPERS
// ==========================================
function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function statusEmoji(status) {
  const map = {
    pending: "⏳",
    completed: "✅",
    paid: "✅",
    expired: "⏰",
    failed: "❌",
    cancelled: "🚫",
  };
  return map[status] || "❓";
}

function statusLabel(status) {
  const map = {
    pending: "Menunggu Pembayaran",
    completed: "Lunas",
    paid: "Lunas",
    expired: "Kedaluwarsa",
    failed: "Gagal",
    cancelled: "Dibatalkan",
  };
  return map[status] || status;
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Pakasir API
  createTransaction,
  getTransactionDetail,
  simulatePayment,
  cancelTransaction,

  // QR
  generateQRImage,
  getPaymentUrl,

  // Order DB
  createOrder,
  updateOrder,
  findOrderById,
  findOrderByOrderId,
  getPendingOrderByBuyer,
  getExpiredOrders,
  getAllOrders,
  loadOrders,

  // Helpers
  formatRupiah,
  formatDate,
  statusEmoji,
  statusLabel,
  generateOrderId,
};
