// ==========================================
// INDEX.JS - Backend Utama
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
const fs = require("fs");
const path = require("path");

const { handleMessage } = require("./handler");
const {
  notifyPaymentSuccess,
  notifyPaymentFailed,
} = require("./handler_pemesanan");
const config = require("./config");
const pakasir = require("./pakasir");
const { setBotRuntimeInfo } = require("./handler_admin_group");
const {
  registerLidMapping,
  processContactsUpsert,
  processContact,
  isLidJid,
  isPhoneJid,
  jidToDigits,
  getLidMapSize,
} = require("./lid_resolver");
const {
  initSessionManager,
  scheduleBackup,
  backupSession,
  AUTH_DIR,
} = require("./session_manager");

// ==========================================
// PATHS & KONFIGURASI
// ==========================================
const logger = pino({ level: "silent" });
const PORT = process.env.PORT || 8080;

// AUTH_DIR dari session_manager = ../session/
// STORE di dalam main branch/
const STORE_PATH = path.resolve(__dirname, "store.json");
const STORE_BACKUP_PATH = path.resolve(__dirname, "store_backup.json");

// ==========================================
// ENSURE DIRECTORIES
// ==========================================
function ensureDirectories() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`📁 Dibuat: ${AUTH_DIR}`);
  }
}

// ==========================================
// STORE MANAGEMENT
// ==========================================
function initStore() {
  const store = makeInMemoryStore({ logger });

  if (fs.existsSync(STORE_PATH)) {
    try {
      store.readFromFile(STORE_PATH);
      console.log("✅ Store loaded dari store.json");
    } catch (e) {
      console.warn(`⚠️ store.json rusak: ${e.message}`);
      if (fs.existsSync(STORE_BACKUP_PATH)) {
        try {
          store.readFromFile(STORE_BACKUP_PATH);
          console.log("✅ Store recovered dari store_backup.json");
        } catch (e2) {
          console.warn(`⚠️ store_backup.json juga rusak: ${e2.message}`);
        }
      }
    }
  } else {
    console.log("ℹ️  store.json belum ada, mulai fresh store.");
  }

  return store;
}

function startStorePersistence(store) {
  setInterval(() => {
    try {
      store.writeToFile(STORE_PATH);

      const now = Date.now();
      if (
        !startStorePersistence._lastBackup ||
        now - startStorePersistence._lastBackup > 60_000
      ) {
        if (fs.existsSync(STORE_PATH)) {
          fs.copyFileSync(STORE_PATH, STORE_BACKUP_PATH);
        }
        startStorePersistence._lastBackup = now;
      }
    } catch (e) {
      console.warn(`⚠️ Gagal simpan store: ${e.message}`);
    }
  }, 10_000);
}

// ==========================================
// GLOBAL STATE
// ==========================================
ensureDirectories();
const store = initStore();
startStorePersistence(store);

let activeSock = null;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

let botStatus = {
  connected: false,
  startTime: new Date(),
  lastPing: null,
  pingCount: 0,
  messageCount: 0,
  webhookCount: 0,
};

// ==========================================
// HTTP SERVER + WEBHOOK PAKASIR
// ==========================================
const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  if (url === "/webhook/pakasir" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║  🔔 WEBHOOK PAKASIR RECEIVED         ║");
      console.log("╚══════════════════════════════════════╝");
      console.log("📦 Body:", body);

      try {
        const data = JSON.parse(body);
        await handlePakasirWebhook(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch (err) {
        console.error("❌ Webhook error:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: err.message }));
      }
    });
    return;
  }

  if (url === "/webhook/pakasir" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "active",
        message: "Pakasir webhook ready. Send POST.",
      }),
    );
    return;
  }

  if (url === "/ping" || url === "/") {
    botStatus.lastPing = new Date();
    botStatus.pingCount++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "alive",
        bot: botStatus.connected ? "connected" : "disconnected",
        uptime: getUptime(botStatus.startTime),
        messages: botStatus.messageCount,
        webhooks: botStatus.webhookCount,
        lidMappings: getLidMapSize(),
        reconnectAttempts,
      }),
    );
    return;
  }

  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy" }));
    return;
  }

  if (url === "/status") {
    const all = pakasir.loadOrders();
    const completed = all.filter((o) => o.status === "completed");
    const revenue = completed.reduce((s, o) => s + o.amount, 0);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><head><title>Bot Status</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="refresh" content="30">
      <style>
        body{font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px}
        .c{background:#1a1a2e;border-radius:16px;padding:30px;max-width:400px;width:100%;margin:8px}
        h1{color:#00ff88}h2{color:#00aaff;font-size:18px}
        .s{display:inline-block;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:14px}
        .on{background:#00ff8830;color:#00ff88}.off{background:#ff444430;color:#ff4444}
        .i div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #333}
        .l{color:#888}.v{color:#fff;font-weight:500}.r{color:#00ff88;font-weight:bold;font-size:16px}
        .w{display:flex;flex-wrap:wrap;justify-content:center}
      </style></head>
      <body><div class="w">
      <div class="c"><h1>🤖 Bot WA</h1>
      <span class="s ${botStatus.connected ? "on" : "off"}">${botStatus.connected ? "🟢 ONLINE" : "🔴 OFFLINE"}</span>
      <div class="i">
      <div><span class="l">Uptime</span><span class="v">${getUptime(botStatus.startTime)}</span></div>
      <div><span class="l">Messages</span><span class="v">${botStatus.messageCount}</span></div>
      <div><span class="l">Webhooks</span><span class="v">${botStatus.webhookCount}</span></div>
      <div><span class="l">LID Mappings</span><span class="v">${getLidMapSize()}</span></div>
      <div><span class="l">Reconnects</span><span class="v">${reconnectAttempts}</span></div>
      </div></div>
      <div class="c"><h2>💳 Payment</h2><div class="i">
      <div><span class="l">Total Orders</span><span class="v">${all.length}</span></div>
      <div><span class="l">✅ Completed</span><span class="v">${completed.length}</span></div>
      <div><span class="l">⏳ Pending</span><span class="v">${all.filter((o) => o.status === "pending").length}</span></div>
      <div><span class="l">💰 Revenue</span><span class="v r">${pakasir.formatRupiah(revenue)}</span></div>
      </div></div></div></body></html>`,
    );
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP Server: port ${PORT}`);
  console.log(`   /ping | /status | /health`);
  console.log(`   /webhook/pakasir (POST)\n`);
});

// ==========================================
// WEBHOOK HANDLER
// ==========================================
async function handlePakasirWebhook(data) {
  botStatus.webhookCount++;

  const orderId = data.order_id;
  const amount = data.amount;
  const status = (data.status || "").toLowerCase();
  const completedAt = data.completed_at;
  const paymentMethod = data.payment_method;

  console.log(
    `🔔 Webhook: order=${orderId} status=${status} amount=${amount} method=${paymentMethod}`,
  );

  const order = pakasir.findOrderByOrderId(orderId);
  if (!order) {
    console.log(`⚠️ Order tidak ditemukan: ${orderId}`);
    return;
  }

  if (status === "completed") {
    if (order.status === "completed") {
      console.log(`⚠️ Order ${orderId} sudah completed, skip.`);
      return;
    }

    pakasir.updateOrder(orderId, {
      status: "completed",
      completedAt: completedAt || new Date().toISOString(),
      paymentMethod: paymentMethod || order.paymentMethod,
    });

    console.log(`✅ Order ${orderId} COMPLETED!`);

    if (activeSock?.user) {
      const updated = pakasir.findOrderById(orderId);
      await notifyPaymentSuccess(activeSock, updated);
    } else {
      console.error("❌ Socket tidak aktif");
    }
  } else if (["expired", "failed", "cancelled"].includes(status)) {
    pakasir.updateOrder(orderId, { status });
    console.log(`${status.toUpperCase()}: ${orderId}`);

    if (activeSock?.user) {
      const updated = pakasir.findOrderById(orderId);
      await notifyPaymentFailed(activeSock, updated, status);
    }
  } else {
    console.log(`ℹ️ Status "${status}" tidak diproses`);
  }
}

// ==========================================
// EXPIRY CHECKER
// ==========================================
setInterval(
  async () => {
    const expired = pakasir.getExpiredOrders();
    for (const order of expired) {
      console.log(`⏰ Auto-expire: ${order.orderId}`);
      pakasir.updateOrder(order.orderId, { status: "expired" });

      if (activeSock?.user) {
        try {
          await notifyPaymentFailed(activeSock, order, "expired");
        } catch (e) {}
      }
    }
    if (expired.length > 0)
      console.log(`⏰ ${expired.length} order(s) expired`);
  },
  2 * 60 * 1000,
);

// ==========================================
// UTILITY
// ==========================================
function getUptime(start) {
  const d = Date.now() - start.getTime();
  const days = Math.floor(d / 86400000);
  const hrs = Math.floor((d % 86400000) / 3600000);
  const min = Math.floor((d % 3600000) / 60000);
  const sec = Math.floor((d % 60000) / 1000);
  const p = [];
  if (days) p.push(`${days}d`);
  if (hrs) p.push(`${hrs}h`);
  if (min) p.push(`${min}m`);
  p.push(`${sec}s`);
  return p.join(" ");
}

// ==========================================
// RECONNECT DENGAN EXPONENTIAL BACKOFF
// ==========================================
async function scheduleReconnect(delay = 3000) {
  if (isReconnecting) return;
  isReconnecting = true;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(
      `❌ Gagal reconnect setelah ${MAX_RECONNECT_ATTEMPTS} percobaan.`,
    );
    isReconnecting = false;
    return;
  }

  reconnectAttempts++;
  const actualDelay = Math.min(
    delay * Math.pow(1.5, reconnectAttempts - 1),
    60_000,
  );

  console.log(
    `🔄 Reconnect #${reconnectAttempts} dalam ${(actualDelay / 1000).toFixed(1)}s...`,
  );

  setTimeout(async () => {
    isReconnecting = false;
    try {
      await startBot();
    } catch (e) {
      console.error(`❌ Reconnect error: ${e.message}`);
      await scheduleReconnect(delay);
    }
  }, actualDelay);
}

// ==========================================
// AUTO-REGISTER LID DARI PESAN MASUK
// ==========================================
async function autoRegisterFromMessage(sock, msg) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!senderJid) return;

    const senderPhone = jidToDigits(senderJid);
    if (senderPhone.length < 8) return;

    const participantLid =
      msg.key?.participantLid || msg.key?.participant_lid || null;

    if (participantLid && isPhoneJid(senderJid)) {
      registerLidMapping(participantLid, senderPhone);
    }

    if (sock.store?.contacts) {
      const contact = sock.store.contacts[senderJid];
      if (contact?.lid) {
        registerLidMapping(contact.lid, senderPhone);
      }

      const altFormats = [
        `${senderPhone}@s.whatsapp.net`,
        `${senderPhone}:0@s.whatsapp.net`,
      ];
      for (const alt of altFormats) {
        const c = sock.store.contacts[alt];
        if (c?.lid) {
          registerLidMapping(c.lid, senderPhone);
          break;
        }
      }
    }

    const mentionedJids =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    for (const mJid of mentionedJids) {
      if (!isLidJid(mJid) && isPhoneJid(mJid)) {
        const phone = jidToDigits(mJid);
        if (phone.length >= 8 && sock.store?.contacts) {
          const c = sock.store.contacts[mJid];
          if (c?.lid) {
            registerLidMapping(c.lid, phone);
          }
        }
      }
    }

    const participantInfo =
      msg.message?.extendedTextMessage?.contextInfo?.participant ||
      msg.message?.extendedTextMessage?.contextInfo?.remoteJid ||
      null;

    if (participantInfo && isPhoneJid(participantInfo)) {
      const pPhone = jidToDigits(participantInfo);
      if (pPhone.length >= 8 && sock.store?.contacts) {
        const c = sock.store.contacts[participantInfo];
        if (c?.lid) {
          registerLidMapping(c.lid, pPhone);
        }
      }
    }
  } catch (e) {
    // silent
  }
}

// ==========================================
// SCAN GRUP: Populate LID map
// ==========================================
async function scanGroupForLidMapping(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];

    let mapped = 0;
    for (const p of participants) {
      if (p.lid && isPhoneJid(p.id) && isLidJid(p.lid)) {
        registerLidMapping(p.lid, jidToDigits(p.id));
        mapped++;
      }
      if (p.lid && isLidJid(p.id) && isPhoneJid(p.lid)) {
        registerLidMapping(p.id, jidToDigits(p.lid));
        mapped++;
      }
    }

    if (mapped > 0) {
      console.log(
        `🔍 [ScanGroup] ${groupJid}: ${mapped}/${participants.length} LID mapped`,
      );
    }
  } catch (e) {
    // silent
  }
}

// ==========================================
// START BOT
// ==========================================
async function startBot() {
  ensureDirectories();

  const credsPath = path.join(AUTH_DIR, "creds.json");
  const sessionExists = fs.existsSync(credsPath);

  console.log(
    sessionExists
      ? `🔑 Session ditemukan di ${AUTH_DIR} — resume...`
      : `📱 Session tidak ada — tampilkan QR Code...`,
  );

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`📌 WA Web v${version.join(".")}, latest: ${isLatest}`);

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
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 2_000,
    maxMsgRetryCount: 3,
  });

  sock.store = store;
  activeSock = sock;
  store?.bind(sock.ev);

  // ==========================================
  // CONNECTION UPDATE
  // ==========================================
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (qr) {
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   📱 SCAN QR CODE DI BAWAH INI      ║");
      console.log("╚══════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
      console.log("\n⚠️  QR Code berlaku ~20 detik, scan cepat!\n");
    }

    if (connection === "open") {
      botStatus.connected = true;
      activeSock = sock;
      reconnectAttempts = 0;
      isReconnecting = false;
      setBotRuntimeInfo(sock);

      console.log("\n╔══════════════════════════════════════╗");
      if (isNewLogin) {
        console.log("║   🆕 LOGIN BARU BERHASIL!            ║");
      } else {
        console.log("║   ✅ SESSION RESUME BERHASIL!        ║");
      }
      console.log("╚══════════════════════════════════════╝");
      console.log(`🤖 Bot user.id : ${sock.user?.id || "-"}`);
      console.log(`🔑 Bot user.lid: ${sock.user?.lid || "-"}\n`);

      if (sock.user?.id && sock.user?.lid) {
        const botPhone = jidToDigits(sock.user.id);
        if (botPhone.length >= 8) {
          registerLidMapping(sock.user.lid, botPhone);
        }
      }

      // Backup segera setelah login baru
      if (isNewLogin) {
        console.log("💾 Login baru — backup session ke GitHub...");
        scheduleBackup(3000);
      }

      // Scan grup
      setTimeout(async () => {
        try {
          if (sock.store?.chats) {
            const groupChats = Object.keys(sock.store.chats).filter((id) =>
              id.endsWith("@g.us"),
            );
            if (groupChats.length > 0) {
              console.log(
                `🔍 Scanning ${groupChats.length} grup untuk LID mapping...`,
              );
              for (const gid of groupChats) {
                await scanGroupForLidMapping(sock, gid);
                await new Promise((r) => setTimeout(r, 300));
              }
              console.log(
                `✅ Scan selesai. LID map: ${getLidMapSize()} entries`,
              );
            }
          }
        } catch (e) {
          console.error(`⚠️ Scan grup error: ${e.message}`);
        }
      }, 5000);
    }

    if (connection === "close") {
      botStatus.connected = false;
      activeSock = null;

      const error = lastDisconnect?.error;
      const statusCode =
        error instanceof Boom ? error.output?.statusCode : null;

      console.log(`\n⚠️  Koneksi terputus.`);
      console.log(`   Status code : ${statusCode || "unknown"}`);
      console.log(`   Error       : ${error?.message || "unknown"}`);

      const LOGOUT_CODES = [
        DisconnectReason.loggedOut,
        DisconnectReason.forbidden,
      ];

      const isLoggedOut = LOGOUT_CODES.includes(statusCode);

      if (isLoggedOut) {
        console.log("\n🚪 SESSION TIDAK VALID — Perlu scan QR ulang.");
        console.log("   Menghapus session lama...");

        try {
          const files = fs.readdirSync(AUTH_DIR);
          for (const file of files) {
            fs.unlinkSync(path.join(AUTH_DIR, file));
          }
          console.log("✅ Session lama dihapus.");
        } catch (e) {
          console.error(`❌ Gagal hapus session: ${e.message}`);
        }

        await scheduleReconnect(3000);
        return;
      }

      await scheduleReconnect(3000);
    }
  });

  // ==========================================
  // CREDS UPDATE — Simpan + backup ke GitHub
  // ==========================================
  sock.ev.on("creds.update", async () => {
    await saveCreds();
    console.log("💾 Credentials tersimpan.");
    scheduleBackup(5000);
  });

  // ==========================================
  // CONTACTS UPSERT
  // ==========================================
  sock.ev.on("contacts.upsert", (contacts) => {
    console.log(`📇 contacts.upsert: ${contacts.length} contacts`);
    processContactsUpsert(contacts);
    console.log(`   LID map size: ${getLidMapSize()}`);
  });

  // ==========================================
  // CONTACTS UPDATE
  // ==========================================
  sock.ev.on("contacts.update", (updates) => {
    for (const update of updates) {
      processContact(update);
    }
  });

  // ==========================================
  // CHATS UPSERT
  // ==========================================
  sock.ev.on("chats.upsert", (chats) => {
    for (const chat of chats) {
      if (chat.id && chat.lid) {
        if (isLidJid(chat.lid) && isPhoneJid(chat.id)) {
          registerLidMapping(chat.lid, jidToDigits(chat.id));
        }
        if (isPhoneJid(chat.lid) && isLidJid(chat.id)) {
          registerLidMapping(chat.id, jidToDigits(chat.lid));
        }
      }
    }
  });

  // ==========================================
  // GROUP PARTICIPANTS UPDATE
  // ==========================================
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupId } = update;
      await scanGroupForLidMapping(sock, groupId);
    } catch (e) {}
  });

  // ==========================================
  // MESSAGES UPSERT
  // ==========================================
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      botStatus.messageCount++;
      try {
        await autoRegisterFromMessage(sock, msg);
        await handleMessage(sock, msg);
      } catch (e) {
        console.error(`❌ Error handle message: ${e.message}`);
      }
    }
  });

  return sock;
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function gracefulShutdown(signal) {
  console.log(`\n📴 Menerima ${signal} — shutdown...`);

  try {
    if (store) {
      store.writeToFile(STORE_PATH);
      fs.copyFileSync(STORE_PATH, STORE_BACKUP_PATH);
      console.log("💾 Store tersimpan.");
    }
  } catch (e) {
    console.error(`⚠️ Gagal simpan store: ${e.message}`);
  }

  try {
    await backupSession();
    console.log("💾 Session di-backup sebelum shutdown.");
  } catch (e) {
    console.warn(`⚠️ Gagal backup session: ${e.message}`);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("❌ uncaughtException:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ unhandledRejection:", reason);
});

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   🤖 BOT WA + PAKASIR QRIS          ║");
  console.log("║   API: app.pakasir.com               ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Step 1: Init & restore session
  await initSessionManager();

  // Step 2: Start bot
  await startBot();
}

main().catch((err) => {
  console.error("Fatal:", err);
  scheduleReconnect(5000);
});
