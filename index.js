// ==========================================
//  INDEX.JS - Backend
//  Koneksi WhatsApp, Auth, HTTP Keep-Alive
//  Webhook PAKASIR untuk notifikasi pembayaran
// ==========================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
} = require("atexovi-baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const http = require("http");

// Import handler dan database
const { handleMessage } = require("./handler");
const { updateOrder, getOrder } = require("./database");
const pakasir = require("./pakasir");
const config = require("./config");

// ==========================================
// KONFIGURASI
// ==========================================
const logger = pino({ level: "silent" });
const PORT = process.env.PORT || 8080;

const store = makeInMemoryStore({ logger });
store?.readFromFile("./store.json");
setInterval(() => {
  store?.writeToFile("./store.json");
}, 10_000);

// ==========================================
// VARIABEL STATUS BOT
// ==========================================
let botStatus = {
  connected: false,
  startTime: new Date(),
  lastPing: null,
  pingCount: 0,
  messageCount: 0,
};

// Global socket untuk diakses handler & webhook
global.sock = null;

// ==========================================
// HTTP SERVER (termasuk webhook PAKASIR)
// ==========================================
const server = http.createServer(async (req, res) => {
  const url = req.url;
  const now = new Date();

  // ====== ROUTE: /ping ======
  if (url === "/ping" || url === "/") {
    botStatus.lastPing = now;
    botStatus.pingCount++;

    const uptime = getUptime(botStatus.startTime);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "alive",
        bot: botStatus.connected ? "connected" : "disconnected",
        uptime: uptime,
        pingCount: botStatus.pingCount,
        messageCount: botStatus.messageCount,
        lastPing: now.toISOString(),
        timestamp: now.toISOString(),
      }),
    );
    console.log(`🏓 Ping #${botStatus.pingCount} received | Uptime: ${uptime}`);
    return;
  }

  // ====== ROUTE: /health ======
  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        bot: botStatus.connected ? "online" : "offline",
        uptime: getUptime(botStatus.startTime),
      }),
    );
    return;
  }

  // ====== ROUTE: /status ======
  if (url === "/status") {
    const uptime = getUptime(botStatus.startTime);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WA Bot Status</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: #0a0a0a;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
          }
          .card {
            background: #1a1a2e;
            border-radius: 16px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 0 30px rgba(0,255,136,0.1);
          }
          h1 { color: #00ff88; margin-top: 0; }
          .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
          }
          .online { background: #00ff8830; color: #00ff88; }
          .offline { background: #ff444430; color: #ff4444; }
          .info { margin: 20px 0; }
          .info div {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #333;
          }
          .label { color: #888; }
          .value { color: #fff; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🤖 WA Bot</h1>
          <span class="status ${botStatus.connected ? "online" : "offline"}">
            ${botStatus.connected ? "🟢 ONLINE" : "🔴 OFFLINE"}
          </span>
          <div class="info">
            <div><span class="label">Uptime</span><span class="value">${uptime}</span></div>
            <div><span class="label">Ping Count</span><span class="value">${botStatus.pingCount}</span></div>
            <div><span class="label">Messages</span><span class="value">${botStatus.messageCount}</span></div>
            <div><span class="label">Last Ping</span><span class="value">${botStatus.lastPing ? botStatus.lastPing.toLocaleString("id-ID") : "Never"}</span></div>
            <div><span class="label">Started</span><span class="value">${botStatus.startTime.toLocaleString("id-ID")}</span></div>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // ====== ROUTE: WEBHOOK PAKASIR ======
  if (url === "/pakasir-webhook" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        console.log("📩 Webhook diterima dari PAKASIR:", payload);

        // Sesuaikan key dengan format yang dikirim PAKASIR
        const orderId = payload.order_id || payload.id;
        const newStatus = payload.status; // 'paid', 'expired', 'failed'

        if (!orderId) {
          console.warn("⚠️ Webhook tidak mengandung order_id");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        // Cek order di database lokal
        const localOrder = getOrder(orderId);
        if (!localOrder) {
          console.warn(`⚠️ Order ${orderId} tidak ditemukan di database`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        // Opsional: konfirmasi ulang ke PAKASIR untuk memastikan status
        try {
          const remoteOrder = await pakasir.getOrder(orderId);
          if (remoteOrder.status !== "paid") {
            console.log(
              `ℹ️ Status order ${orderId} dari PAKASIR: ${remoteOrder.status} - tidak diproses`,
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));
            return;
          }
        } catch (err) {
          console.error("Gagal konfirmasi ke PAKASIR:", err.message);
          // Tetap lanjut dengan asumsi webhook valid
        }

        if (newStatus === "paid") {
          // Update status order di database lokal
          const updatedOrder = updateOrder(orderId, { status: "paid" });
          if (updatedOrder && global.sock) {
            // Kirim notifikasi ke customer via WhatsApp
            const userJid = updatedOrder.userJid;
            const message = `✅ *PEMBAYARAN BERHASIL!*\n\nTerima kasih telah melakukan pembayaran untuk paket *${updatedOrder.packageName}*.\n\nKami akan segera memproses pesanan Anda. Mohon tunggu konfirmasi lebih lanjut.\n\n📋 *Detail Order:*\nID: ${updatedOrder.id}\nPaket: ${updatedOrder.packageName}\nTotal: Rp${updatedOrder.amount.toLocaleString()}\n\n🕒 Estimasi pengerjaan: ${updatedOrder.estimatedTime}\n\nSalam, ${config.botName}`;
            await global.sock.sendMessage(userJid, { text: message });
            console.log(`✅ Notifikasi pembayaran dikirim ke ${userJid}`);
          }
        } else {
          console.log(
            `ℹ️ Status order ${orderId} = ${newStatus}, tidak diproses lebih lanjut`,
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch (err) {
        console.error("❌ Webhook error:", err);
        res.writeHead(500);
        res.end("Internal error");
      }
    });
    return;
  }

  // ====== ROUTE: 404 ======
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP Server running on port ${PORT}`);
  console.log(`   📍 Ping endpoint: http://localhost:${PORT}/ping`);
  console.log(`   📍 Status page:   http://localhost:${PORT}/status`);
  console.log(`   📍 Health check:  http://localhost:${PORT}/health`);
  console.log(
    `   📍 Webhook PAKASIR: http://localhost:${PORT}/pakasir-webhook`,
  );
  console.log("");
});

// ==========================================
// UTILITY: Hitung uptime
// ==========================================
function getUptime(startTime) {
  const diff = Date.now() - startTime.getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

// ==========================================
// FUNGSI UTAMA: START BOT
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(
    `📌 Menggunakan WA Web v${version.join(".")}, isLatest: ${isLatest}`,
  );

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
    browser: ["Bot WhatsApp", "Chrome", "1.0.0"],
  });

  store?.bind(sock.ev);
  global.sock = sock; // Simpan global untuk akses dari handler & webhook

  // EVENT: CONNECTION UPDATE
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\n╔════════════════════════════════════╗");
      console.log("║   📱 SCAN QR CODE DI BAWAH INI      ║");
      console.log("║   Buka WhatsApp > Linked Devices     ║");
      console.log("║   > Link a Device > Scan QR          ║");
      console.log("╚════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      botStatus.connected = true;
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   ✅ BOT BERHASIL TERHUBUNG!         ║");
      console.log("║   Bot siap menerima pesan            ║");
      console.log("╚══════════════════════════════════════╝\n");
    }
    if (connection === "close") {
      botStatus.connected = false;
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;
      console.log("❌ Koneksi terputus:", lastDisconnect?.error?.message);
      if (shouldReconnect) {
        console.log("🔄 Mencoba reconnect...");
        startBot();
      } else {
        console.log(
          "🚪 Bot logged out. Hapus folder auth_session dan scan ulang.",
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      botStatus.messageCount++;
      await handleMessage(sock, msg);
    }
  });

  return sock;
}

console.log("╔══════════════════════════════════════╗");
console.log("║   🤖 BOT WHATSAPP - STARTING...     ║");
console.log("║   Library: atexovi-baileys           ║");
console.log("║   Anti-Idle: HTTP Keep-Alive         ║");
console.log("╚══════════════════════════════════════╝\n");

startBot().catch((err) => {
  console.error("Fatal error:", err);
});
