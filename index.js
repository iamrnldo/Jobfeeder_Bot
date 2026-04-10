// ==========================================
//  INDEX.JS - Backend Utama
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

// ==========================================
// KONFIGURASI
// ==========================================
const logger = pino({ level: "silent" });
const PORT = process.env.PORT || 8080;

const store = makeInMemoryStore({ logger });
store?.readFromFile("./store.json");
setInterval(() => store?.writeToFile("./store.json"), 10_000);

let activeSock = null;

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
// AUTO-REGISTER LID DARI PESAN MASUK
// ==========================================
async function autoRegisterFromMessage(sock, msg) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    if (!senderJid) return;

    const senderPhone = jidToDigits(senderJid);
    if (senderPhone.length < 8) return;

    // ── participantLid: field kunci dari Baileys ──
    // Tersedia di group message, berisi LID dari sender
    const participantLid =
      msg.key?.participantLid || msg.key?.participant_lid || null;

    if (participantLid && isPhoneJid(senderJid)) {
      registerLidMapping(participantLid, senderPhone);
    }

    // ── store.contacts ──
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

    // ── Mentions dalam pesan ──
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

    // ── participant info dari message ──
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
    // silent — jangan crash karena LID mapping
  }
}

// ==========================================
// SCAN GRUP: Populate LID map dari semua peserta
// Dipanggil saat bot connect atau saat butuh resolve
// ==========================================
async function scanGroupForLidMapping(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];

    let mapped = 0;
    for (const p of participants) {
      // Case 1: p.id = phone, p.lid = LID
      if (p.lid && isPhoneJid(p.id) && isLidJid(p.lid)) {
        registerLidMapping(p.lid, jidToDigits(p.id));
        mapped++;
      }
      // Case 2: p.id = LID, p.lid = phone
      if (p.lid && isLidJid(p.id) && isPhoneJid(p.lid)) {
        registerLidMapping(p.id, jidToDigits(p.lid));
        mapped++;
      }
    }

    if (mapped > 0) {
      console.log(
        `🔍 [ScanGroup] ${groupJid}: ${mapped} LID mapped dari ${participants.length} participants`,
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
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");
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
  });

  activeSock = sock;
  store?.bind(sock.ev);

  // ==========================================
  // CONNECTION UPDATE
  // ==========================================
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   📱 SCAN QR CODE DI BAWAH INI      ║");
      console.log("╚══════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      botStatus.connected = true;
      activeSock = sock;
      setBotRuntimeInfo(sock);

      console.log(`🤖 Bot user.id : ${sock.user?.id || "-"}`);
      console.log(`🔑 Bot user.lid: ${sock.user?.lid || "-"}`);

      // Register bot sendiri
      if (sock.user?.id && sock.user?.lid) {
        const botPhone = jidToDigits(sock.user.id);
        if (botPhone.length >= 8) {
          registerLidMapping(sock.user.lid, botPhone);
        }
      }

      console.log("\n╔══════════════════════════════════════╗");
      console.log("║   ✅ BOT + PAKASIR QRIS READY!       ║");
      console.log("╚══════════════════════════════════════╝\n");

      // Scan semua grup yang diketahui store
      setTimeout(async () => {
        try {
          if (sock.store?.chats) {
            const groupChats = Object.keys(sock.store.chats).filter((id) =>
              id.endsWith("@g.us"),
            );
            console.log(
              `🔍 Scanning ${groupChats.length} grup untuk LID mapping...`,
            );
            for (const gid of groupChats) {
              await scanGroupForLidMapping(sock, gid);
              // Delay kecil agar tidak rate-limit
              await new Promise((r) => setTimeout(r, 300));
            }
            console.log(
              `✅ Scan grup selesai. LID map: ${getLidMapSize()} entries`,
            );
          }
        } catch (e) {
          console.error(`⚠️ Scan grup error: ${e.message}`);
        }
      }, 5000); // Delay 5 detik setelah connect
    }

    if (connection === "close") {
      botStatus.connected = false;
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !==
            DisconnectReason.loggedOut
          : true;

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        startBot();
      } else {
        console.log("🚪 Logged out.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ==========================================
  // CONTACTS UPSERT — Sumber utama LID mapping
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
      await autoRegisterFromMessage(sock, msg);
      await handleMessage(sock, msg);
    }
  });

  return sock;
}

// ==========================================
// RUN
// ==========================================
console.log("╔══════════════════════════════════════╗");
console.log("║   🤖 BOT WA + PAKASIR QRIS          ║");
console.log("║   API: app.pakasir.com               ║");
console.log("╚══════════════════════════════════════╝\n");

startBot().catch((err) => console.error("Fatal:", err));
