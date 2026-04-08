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

// ✅ Ganti dari local JSON ke database_api.js
const db = require("./database_api");

// ==========================================
// ORDER FUNCTIONS — delegate ke database_api
// ==========================================

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

async function createOrder(data) {
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
    paymentNumber: null,
    expiredAt: null,
    status: "pending",
    createdAt: new Date().toISOString(),
    completedAt: null,
    notifiedBuyer: false,
    notifiedSeller: false,
    qrisMessageKey: null,
    mockApiId: null,
  };

  // ✅ Simpan ke local + upload ke MockAPI (background)
  await db.createOrder(order);

  console.log(`📦 Order created: ${order.orderId} | ${order.serviceName}`);
  return order;
}

async function updateOrder(orderId, updates) {
  // ✅ Update local + MockAPI (background)
  return await db.updateOrder(orderId, updates);
}

function loadOrders() {
  return db.loadOrders();
}

function findOrderById(orderId) {
  return db.findOrderById(orderId);
}

function findOrderByOrderId(orderId) {
  return db.findOrderByOrderId(orderId);
}

function findOrderByTransactionId(transactionId) {
  return db.findOrderByTransactionId(transactionId);
}

function findOrderByReference(reference) {
  return db.findOrderByReference(reference);
}

function getPendingOrderByBuyer(buyerNumber) {
  return db.getPendingOrderByBuyer(buyerNumber);
}

function getExpiredOrders() {
  return db.getExpiredOrders();
}

function getAllOrders(limit = 20) {
  return db.getAllOrders(limit);
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

    const req = lib.request(requestOptions, (res) => {
      let data = "";
      if (
        [301, 302, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
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
// ==========================================
async function createTransaction(orderId, amount, method) {
  const { baseUrl, project, apiKey } = config.pakasir;
  const paymentMethod = method || config.pakasir.paymentMethod || "qris";
  const url = `${baseUrl}/api/transactioncreate/${paymentMethod}`;

  const body = JSON.stringify({
    project,
    order_id: orderId,
    amount,
    api_key: apiKey,
  });

  console.log(`\n💳 Pakasir createTransaction: ${orderId} | ${amount} | ${paymentMethod}`);

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
      body
    );

    console.log(`📥 Pakasir response (${response.status}):`, JSON.stringify(response.data, null, 2));

    if (
      response.status >= 200 &&
      response.status < 300 &&
      response.data?.payment
    ) {
      return { success: true, payment: response.data.payment };
    } else {
      const errMsg =
        typeof response.data === "object"
          ? response.data.message || response.data.error || JSON.stringify(response.data)
          : String(response.data);
      return { success: false, error: `HTTP ${response.status}: ${errMsg}` };
    }
  } catch (err) {
    console.error(`❌ Pakasir API error:`, err.message);
    return { success: false, error: err.message };
  }
}

// ==========================================
// ✅ API: Transaction Detail
// GET https://app.pakasir.com/api/transactiondetail?...
// ==========================================
async function getTransactionDetail(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const url =
    `${baseUrl}/api/transactiondetail` +
    `?project=${encodeURIComponent(project)}` +
    `&amount=${amount}` +
    `&order_id=${encodeURIComponent(orderId)}` +
    `&api_key=${encodeURIComponent(apiKey)}`;

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
      return { success: true, transaction: response.data.transaction };
    }
    return {
      success: false,
      error:
        typeof response.data === "object"
          ? response.data.message || JSON.stringify(response.data)
          : String(response.data),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==========================================
// ✅ API: Payment Simulation (Sandbox)
// ==========================================
async function simulatePayment(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const body = JSON.stringify({ project, order_id: orderId, amount, api_key: apiKey });

  try {
    const response = await httpRequest(
      `${baseUrl}/api/paymentsimulation`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      body
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
// ✅ API: Transaction Cancel
// ==========================================
async function cancelTransaction(orderId, amount) {
  const { baseUrl, project, apiKey } = config.pakasir;

  const body = JSON.stringify({ project, order_id: orderId, amount, api_key: apiKey });

  try {
    const response = await httpRequest(
      `${baseUrl}/api/transactioncancel`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      body
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
// ✅ Generate QR Image dari QR String
// ==========================================
async function generateQRImage(qrString) {
  try {
    const buffer = await QRCode.toBuffer(qrString, {
      type: "png",
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });
    return buffer;
  } catch (err) {
    console.error(`❌ QR generation error:`, err.message);
    return null;
  }
}

// ==========================================
// ✅ Generate Payment URL
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

  // Order DB (via database_api)
  createOrder,
  updateOrder,
  loadOrders,
  findOrderById,
  findOrderByOrderId,
  findOrderByTransactionId,
  findOrderByReference,
  getPendingOrderByBuyer,
  getExpiredOrders,
  getAllOrders,
  generateOrderId,

  // Format helpers
  formatRupiah,
  formatDate,
  statusEmoji,
  statusLabel,
};