// ==========================================
//  DATABASE_API.JS
//  MockAPI + Local JSON (dual storage)
//  MockAPI: https://69d6de919c5ebb0918c6c66b.mockapi.io/order/order
//  Local:   database/orders.json
// ==========================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ==========================================
// KONFIGURASI
// ==========================================
const MOCKAPI_URL = "https://69d6de919c5ebb0918c6c66b.mockapi.io/order/order";

const LOCAL_DB_PATH = path.join(__dirname, "database", "orders.json");

// ==========================================
// HELPER: Pastikan folder database ada
// ==========================================
function ensureDir() {
  const dir = path.dirname(LOCAL_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ==========================================
// HELPER: HTTP Request
// ==========================================
function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    };

    const req = lib.request(requestOptions, (res) => {
      let data = "";

      // Handle redirect
      if (
        [301, 302, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        httpRequest(res.headers.location, options, body)
          .then(resolve)
          .catch(reject);
        return;
      }

      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: data,
          });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout (10s)"));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ==========================================
// LOCAL DATABASE FUNCTIONS
// ==========================================

function readLocalDB() {
  try {
    ensureDir();
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      fs.writeFileSync(LOCAL_DB_PATH, "[]");
      return [];
    }
    const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ Read local DB error:", err.message);
    return [];
  }
}

function writeLocalDB(orders) {
  try {
    ensureDir();
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error("❌ Write local DB error:", err.message);
  }
}

// ==========================================
// MOCKAPI FUNCTIONS
// ==========================================

/**
 * GET semua order dari MockAPI
 */
async function fetchAllFromAPI() {
  try {
    const res = await httpRequest(MOCKAPI_URL);
    if (res.status === 200 && Array.isArray(res.data)) {
      return { success: true, data: res.data };
    }
    return { success: false, data: [] };
  } catch (err) {
    console.error("❌ MockAPI fetchAll error:", err.message);
    return { success: false, data: [] };
  }
}

/**
 * GET satu order dari MockAPI berdasarkan orderId (field kustom)
 * MockAPI pakai ID internal, kita cari berdasarkan orderId field
 */
async function fetchOneFromAPI(orderId) {
  try {
    // Cari berdasarkan query param (MockAPI support filter)
    const url = `${MOCKAPI_URL}?orderId=${encodeURIComponent(orderId)}`;
    const res = await httpRequest(url);

    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return { success: true, data: res.data[0] };
    }
    return { success: false, data: null };
  } catch (err) {
    console.error("❌ MockAPI fetchOne error:", err.message);
    return { success: false, data: null };
  }
}

/**
 * POST order baru ke MockAPI
 */
async function createInAPI(orderData) {
  try {
    const res = await httpRequest(MOCKAPI_URL, { method: "POST" }, orderData);

    if (res.status === 200 || res.status === 201) {
      console.log(`✅ MockAPI create success: ${orderData.orderId}`);
      return { success: true, data: res.data };
    }

    console.error(`❌ MockAPI create failed: HTTP ${res.status}`);
    return { success: false, data: null };
  } catch (err) {
    console.error("❌ MockAPI create error:", err.message);
    return { success: false, data: null };
  }
}

/**
 * PUT update order di MockAPI
 * Perlu ID internal MockAPI (bukan orderId kita)
 */
async function updateInAPI(mockApiId, updateData) {
  try {
    const url = `${MOCKAPI_URL}/${mockApiId}`;
    const res = await httpRequest(url, { method: "PUT" }, updateData);

    if (res.status === 200) {
      console.log(`✅ MockAPI update success: ${mockApiId}`);
      return { success: true, data: res.data };
    }

    console.error(`❌ MockAPI update failed: HTTP ${res.status}`);
    return { success: false, data: null };
  } catch (err) {
    console.error("❌ MockAPI update error:", err.message);
    return { success: false, data: null };
  }
}

/**
 * DELETE order dari MockAPI
 */
async function deleteFromAPI(mockApiId) {
  try {
    const url = `${MOCKAPI_URL}/${mockApiId}`;
    const res = await httpRequest(url, { method: "DELETE" });

    if (res.status === 200) {
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    console.error("❌ MockAPI delete error:", err.message);
    return { success: false };
  }
}

// ==========================================
// SINKRONISASI: Local → MockAPI
// Dipanggil saat startup untuk sync data
// ==========================================
async function syncLocalToAPI() {
  console.log("🔄 Syncing local DB to MockAPI...");

  const localOrders = readLocalDB();
  if (localOrders.length === 0) {
    console.log("📭 No local orders to sync.");
    return;
  }

  // Fetch semua yang sudah ada di API
  const apiResult = await fetchAllFromAPI();
  const apiOrders = apiResult.success ? apiResult.data : [];
  const apiOrderIds = apiOrders.map((o) => o.orderId);

  let synced = 0;

  for (const order of localOrders) {
    if (!apiOrderIds.includes(order.orderId)) {
      // Belum ada di API → upload
      const result = await createInAPI(order);
      if (result.success) {
        // Simpan mockApiId ke local
        const locals = readLocalDB();
        const idx = locals.findIndex((o) => o.orderId === order.orderId);
        if (idx !== -1) {
          locals[idx].mockApiId = result.data.id || result.data._id;
          writeLocalDB(locals);
        }
        synced++;
      }
    }
  }

  console.log(`✅ Sync complete: ${synced} order(s) uploaded to MockAPI`);
}

// ==========================================
// SINKRONISASI: MockAPI → Local
// Update local dari API (ambil data terbaru)
// ==========================================
async function syncAPIToLocal() {
  console.log("🔄 Syncing MockAPI to local DB...");

  const apiResult = await fetchAllFromAPI();
  if (!apiResult.success) {
    console.log("⚠️ Cannot reach MockAPI, keeping local data.");
    return;
  }

  const apiOrders = apiResult.data;

  // Gabungkan: API sebagai sumber utama
  // Local tetap disimpan sebagai backup
  writeLocalDB(apiOrders);

  console.log(`✅ Local DB updated: ${apiOrders.length} order(s) from MockAPI`);
}

// ==========================================
// UNIFIED ORDER DATABASE FUNCTIONS
// ✅ Dual storage: Local + MockAPI
// ==========================================

/**
 * Load semua orders
 * Prioritas: Local (lebih cepat), lalu sync dengan API
 */
function loadOrders() {
  return readLocalDB();
}

/**
 * Buat order baru
 * Simpan ke local DULU (cepat), lalu upload ke API (background)
 */
async function createOrder(orderData) {
  // Simpan ke local
  const locals = readLocalDB();
  locals.push(orderData);
  writeLocalDB(locals);

  console.log(`📦 Order saved locally: ${orderData.orderId}`);

  // Upload ke MockAPI (background, tidak block)
  createInAPI(orderData)
    .then((result) => {
      if (result.success) {
        // Simpan mockApiId ke local untuk update nanti
        const updated = readLocalDB();
        const idx = updated.findIndex((o) => o.orderId === orderData.orderId);
        if (idx !== -1) {
          updated[idx].mockApiId = result.data.id || result.data._id || null;
          writeLocalDB(updated);
          console.log(
            `☁️ Order uploaded to MockAPI: ${orderData.orderId} | mockApiId: ${updated[idx].mockApiId}`,
          );
        }
      }
    })
    .catch((err) => {
      console.error(
        `⚠️ MockAPI upload failed (will retry on next sync): ${err.message}`,
      );
    });

  return orderData;
}

/**
 * Update order
 * Update local DULU, lalu update API (background)
 */
async function updateOrder(orderId, updates) {
  // Update local
  const orders = readLocalDB();
  const idx = orders.findIndex((o) => o.orderId === orderId);

  if (idx === -1) {
    console.error(`❌ Order not found locally: ${orderId}`);
    return null;
  }

  orders[idx] = { ...orders[idx], ...updates };
  writeLocalDB(orders);

  const updatedOrder = orders[idx];

  console.log(
    `📝 Order updated locally: ${orderId} | status: ${updatedOrder.status}`,
  );

  // Update di MockAPI (background)
  if (updatedOrder.mockApiId) {
    updateInAPI(updatedOrder.mockApiId, updatedOrder)
      .then((result) => {
        if (result.success) {
          console.log(`☁️ Order updated in MockAPI: ${orderId}`);
        }
      })
      .catch((err) => {
        console.error(`⚠️ MockAPI update failed: ${err.message}`);
      });
  } else {
    // Tidak punya mockApiId → cari dulu, lalu update
    fetchOneFromAPI(orderId)
      .then((result) => {
        if (result.success && result.data) {
          const mockId = result.data.id || result.data._id;

          // Simpan mockApiId ke local
          const fresh = readLocalDB();
          const freshIdx = fresh.findIndex((o) => o.orderId === orderId);
          if (freshIdx !== -1) {
            fresh[freshIdx].mockApiId = mockId;
            writeLocalDB(fresh);
          }

          // Update di API
          return updateInAPI(mockId, updatedOrder);
        }
      })
      .then((result) => {
        if (result?.success) {
          console.log(
            `☁️ Order updated in MockAPI (found by orderId): ${orderId}`,
          );
        }
      })
      .catch((err) => {
        console.error(`⚠️ MockAPI update (fallback) failed: ${err.message}`);
      });
  }

  return updatedOrder;
}

/**
 * Cari order berdasarkan orderId
 */
function findOrderById(orderId) {
  const orders = readLocalDB();
  return orders.find((o) => o.orderId === orderId) || null;
}

/**
 * Cari order berdasarkan orderId (alias)
 */
function findOrderByOrderId(orderId) {
  return findOrderById(orderId);
}

/**
 * Cari order berdasarkan transactionId
 */
function findOrderByTransactionId(transactionId) {
  const orders = readLocalDB();
  return orders.find((o) => o.transactionId === transactionId) || null;
}

/**
 * Cari order berdasarkan reference
 */
function findOrderByReference(reference) {
  return findOrderById(reference);
}

/**
 * Cari order pending milik buyer
 */
function getPendingOrderByBuyer(buyerNumber) {
  const orders = readLocalDB();
  return (
    orders.find(
      (o) => o.buyerNumber === buyerNumber && o.status === "pending",
    ) || null
  );
}

/**
 * Ambil order yang sudah expired
 */
function getExpiredOrders() {
  const orders = readLocalDB();
  const now = new Date();
  return orders.filter(
    (o) =>
      o.status === "pending" && o.expiredAt && new Date(o.expiredAt) <= now,
  );
}

/**
 * Ambil semua order (terbaru dulu)
 */
function getAllOrders(limit = 20) {
  const orders = readLocalDB();
  return orders.slice(-limit).reverse();
}

// ==========================================
// FORCE SYNC: Paksa sinkronisasi dua arah
// Bisa dipanggil manual atau periodik
// ==========================================
async function forceSync() {
  console.log("\n🔄 ═══════════════════════════════════");
  console.log("🔄 Force sync: Local ↔ MockAPI");
  console.log("🔄 ═══════════════════════════════════\n");

  try {
    // 1. Ambil semua dari API
    const apiResult = await fetchAllFromAPI();

    if (!apiResult.success) {
      // API tidak bisa dijangkau → upload local ke API
      console.log("⚠️ MockAPI unreachable, uploading local to API...");
      await syncLocalToAPI();
      return;
    }

    const apiOrders = apiResult.data;
    const apiOrderIds = apiOrders.map((o) => o.orderId);

    // 2. Baca local
    const localOrders = readLocalDB();
    const localOrderIds = localOrders.map((o) => o.orderId);

    // 3. Order yang ada di local tapi tidak di API → upload
    const toUpload = localOrders.filter(
      (o) => !apiOrderIds.includes(o.orderId),
    );

    for (const order of toUpload) {
      const result = await createInAPI(order);
      if (result.success) {
        const idx = localOrders.findIndex((o) => o.orderId === order.orderId);
        if (idx !== -1) {
          localOrders[idx].mockApiId =
            result.data.id || result.data._id || null;
        }
        console.log(`☁️ Uploaded: ${order.orderId}`);
      }
    }

    // 4. Order yang ada di API tapi tidak di local → download
    const toDownload = apiOrders.filter(
      (o) => !localOrderIds.includes(o.orderId),
    );

    for (const order of toDownload) {
      localOrders.push(order);
      console.log(`📥 Downloaded: ${order.orderId}`);
    }

    // 5. Update status local dari API (API sebagai sumber kebenaran)
    for (const apiOrder of apiOrders) {
      const localIdx = localOrders.findIndex(
        (o) => o.orderId === apiOrder.orderId,
      );
      if (localIdx !== -1) {
        // Simpan mockApiId
        localOrders[localIdx].mockApiId =
          apiOrder.id || apiOrder._id || localOrders[localIdx].mockApiId;

        // Jika status di API lebih update (completed/expired/cancelled)
        const finalStatuses = ["completed", "expired", "failed", "cancelled"];
        if (
          finalStatuses.includes(apiOrder.status) &&
          localOrders[localIdx].status === "pending"
        ) {
          localOrders[localIdx] = {
            ...localOrders[localIdx],
            ...apiOrder,
          };
          console.log(
            `🔄 Status updated from API: ${apiOrder.orderId} → ${apiOrder.status}`,
          );
        }
      }
    }

    // 6. Simpan ke local
    writeLocalDB(localOrders);

    console.log(
      `\n✅ Sync complete:\n` +
        `   📤 Uploaded: ${toUpload.length}\n` +
        `   📥 Downloaded: ${toDownload.length}\n` +
        `   📦 Total local: ${localOrders.length}\n` +
        `   ☁️ Total API: ${apiOrders.length}\n`,
    );
  } catch (err) {
    console.error("❌ Force sync error:", err.message);
  }
}

// ==========================================
// HEALTH CHECK: Cek koneksi ke MockAPI
// ==========================================
async function checkAPIHealth() {
  try {
    const res = await httpRequest(MOCKAPI_URL);
    const isOk = res.status === 200;
    console.log(
      `${isOk ? "✅" : "❌"} MockAPI health: HTTP ${res.status} | ${
        Array.isArray(res.data) ? res.data.length + " orders" : "error"
      }`,
    );
    return isOk;
  } catch (err) {
    console.error(`❌ MockAPI unreachable: ${err.message}`);
    return false;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // CRUD Operations
  loadOrders,
  createOrder,
  updateOrder,
  findOrderById,
  findOrderByOrderId,
  findOrderByTransactionId,
  findOrderByReference,
  getPendingOrderByBuyer,
  getExpiredOrders,
  getAllOrders,

  // Sync
  forceSync,
  syncLocalToAPI,
  syncAPIToLocal,
  checkAPIHealth,

  // MockAPI direct (jika perlu)
  fetchAllFromAPI,
  fetchOneFromAPI,
  createInAPI,
  updateInAPI,
  deleteFromAPI,
};
