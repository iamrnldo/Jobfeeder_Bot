// ==========================================
//  HANDLER.JS - Frontend
//  Command, Menu, Admin, PAYMENT System
//  ✅ Sesuai dokumentasi Pakasir
//  ✅ Pemesanan & QRIS selalu di private chat
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const pakasir = require("./pakasir");

// ==========================================
// PATH DATABASE ADMIN
// ==========================================
const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");

// ==========================================
// HELPER: Delay / sleep
// ==========================================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// HELPER: Cek apakah JID adalah group
// ==========================================
function isGroupChat(jid) {
  return jid.endsWith("@g.us");
}

// ==========================================
// ADMIN DATABASE FUNCTIONS
// ==========================================
function loadAdmins() {
  try {
    const dir = path.dirname(ADMIN_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(ADMIN_DB_PATH)) {
      fs.writeFileSync(ADMIN_DB_PATH, "[]");
      return [];
    }
    return JSON.parse(fs.readFileSync(ADMIN_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveAdmins(admins) {
  const dir = path.dirname(ADMIN_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ADMIN_DB_PATH, JSON.stringify(admins, null, 2));
}

// ==========================================
// HELPERS
// ==========================================
function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

function getNumberFromJid(jid) {
  return jid.split("@")[0];
}

function numberToJid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

function isAdmin(number) {
  const admins = loadAdmins();
  const n = normalizeNumber(number);
  return admins.some((a) => normalizeNumber(a) === n);
}

function isAdminOrOwner(number) {
  return isOwner(number) || isAdmin(number);
}

function getServiceById(id) {
  return config.services.find((s) => s.id === id) || null;
}

// ==========================================
// HANDLER UTAMA
// ==========================================
async function handleMessage(sock, msg) {
  if (msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const sender = msg.pushName || "Unknown";
  const botId = sock.user?.id?.replace(/:.*@/, "@") || "";
  const botNumber = botId.split("@")[0];
  const senderNumber = getNumberFromJid(
    msg.key.participant || msg.key.remoteJid,
  );

  let text = extractText(msg);
  let rawText = text.trim();
  text = text.toLowerCase().trim();

  const isBotMentioned = checkBotMentioned(msg, botNumber);

  console.log(
    `📩 [${isGroupChat(jid) ? "GROUP" : "PRIVATE"}] ${sender} (${senderNumber}): ${text || "[non-text]"}`,
  );

  if (!text) return;

  // ==========================================
  // PARAMETERIZED COMMANDS
  // ==========================================
  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
    await handleAddAdmin(sock, msg, jid, senderNumber, rawText);
    return;
  }
  if (text.startsWith("/deladmin ") || text.startsWith("deladmin ")) {
    await handleDelAdmin(sock, jid, senderNumber, rawText);
    return;
  }
  if (text.startsWith("deladmin_")) {
    await handleDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  // ==========================================
  // ROUTING COMMAND
  // ==========================================
  try {
    switch (text) {
      // ============ MENU UTAMA ============
      case "menu":
      case "/menu":
      case "help":
      case "/help":
        await sendMainMenu(sock, jid, sender, senderNumber);
        break;

      // ============ DEMO FITUR ============
      case "button":
      case "/button":
        await sendButtonMessage(sock, jid);
        break;

      case "list":
      case "/list":
        await sendListMessage(sock, jid);
        break;

      case "template":
      case "/template":
        await sendTemplateButton(sock, jid);
        break;

      case "image":
      case "/image":
        await sendImageWithButton(sock, jid);
        break;

      // ============ RESPONSE INTERACTIVE MENU ============
      case "menu_button":
        await sendButtonMessage(sock, jid);
        break;

      case "menu_list":
        await sendListMessage(sock, jid);
        break;

      case "menu_template":
        await sendTemplateButton(sock, jid);
        break;

      case "menu_image":
        await sendImageWithButton(sock, jid);
        break;

      case "menu_info":
        await sock.sendMessage(jid, {
          text:
            `📌 *INFO BOT*\n\n` +
            `• *Nama:* ${config.botName}\n` +
            `• *Version:* ${config.version}\n` +
            `• *Library:* atexovi-baileys\n` +
            `• *Payment:* Pakasir QRIS\n` +
            `• *Runtime:* Node.js`,
        });
        break;

      case "menu_ping":
        const ps = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 *PONG!*\nSpeed: ${Date.now() - ps}ms\nStatus: Online ✅`,
        });
        break;

      case "menu_creator":
        await sock.sendMessage(jid, {
          text: `👨‍💻 *CREATOR*\n\nGitHub: https://github.com/iamrnldo`,
        });
        break;

      // ==========================================
      // 💼 JASA WEBSITE
      // ==========================================
      case "jasa":
      case "/jasa":
      case "website":
      case "/website":
      case "menu_jasa":
        await sendServiceMenu(sock, jid, sender);
        break;

      // ============ SERVICE SELECTION ============
      case "service_testing":
        await sendServiceDetail(sock, jid, sender, senderNumber, "testing");
        break;

      case "service_landing":
        await sendServiceDetail(sock, jid, sender, senderNumber, "landing");
        break;

      case "service_custom":
        await sendServiceDetail(sock, jid, sender, senderNumber, "custom");
        break;

      case "service_premium":
        await sendServiceDetail(sock, jid, sender, senderNumber, "premium");
        break;

      // ============ KONFIRMASI BAYAR ============
      case "confirm_testing":
        await handleConfirmPayment(sock, jid, sender, senderNumber, "testing");
        break;

      case "confirm_landing":
        await handleConfirmPayment(sock, jid, sender, senderNumber, "landing");
        break;

      case "confirm_custom":
        await handleConfirmPayment(sock, jid, sender, senderNumber, "custom");
        break;

      case "confirm_premium":
        await handleConfirmPayment(sock, jid, sender, senderNumber, "premium");
        break;

      case "cancel_order":
        await handleCancelOrder(sock, jid, senderNumber);
        break;

      // ============ CEK & RIWAYAT ============
      case "cek":
      case "/cek":
      case "cekbayar":
      case "/cekbayar":
      case "menu_cek_bayar":
        await handleCheckPayment(sock, jid, senderNumber);
        break;

      case "riwayat":
      case "/riwayat":
      case "history":
      case "/history":
      case "menu_riwayat":
        await handleOrderHistory(sock, jid, senderNumber);
        break;

      // ==========================================
      // ADMIN PANEL
      // ==========================================
      case "admin_add":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await sock.sendMessage(jid, {
          text:
            `➕ *ADD ADMIN*\n\n` +
            `Ketik:\n\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n` +
            `atau tag user:\n\`\`\`/addadmin @user\`\`\``,
        });
        break;

      case "admin_del":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await sendAdminDeleteList(sock, jid, senderNumber);
        break;

      case "admin_list":
      case "/listadmin":
      case "listadmin":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await sendAdminList(sock, jid);
        break;

      case "admin_orders":
      case "/listorder":
      case "listorder":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await handleAdminListOrders(sock, jid);
        break;

      // ============ BUTTON/LIST RESPONSES ============
      case "btn_info":
        await sock.sendMessage(jid, {
          text: `📌 *INFO BOT*\n\nBot WA + Pakasir QRIS Payment`,
        });
        break;

      case "btn_creator":
        await sock.sendMessage(jid, {
          text: `👨‍💻 *CREATOR*\n\nGitHub: https://github.com/iamrnldo`,
        });
        break;

      case "btn_ping":
        const s = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong! Speed: ${Date.now() - s}ms`,
        });
        break;

      case "list_games":
        await sock.sendMessage(jid, {
          text: `🎮 *GAMES*\n\n_Coming Soon!_`,
        });
        break;

      case "list_tools":
        await sock.sendMessage(jid, {
          text: `🔧 *TOOLS*\n\n_Coming Soon!_`,
        });
        break;

      case "list_downloader":
        await sock.sendMessage(jid, {
          text: `📥 *DOWNLOADER*\n\n_Coming Soon!_`,
        });
        break;

      case "list_info":
        await sock.sendMessage(jid, {
          text: `📋 *INFO*\n\nVersion: ${config.version}\nPayment: Pakasir QRIS`,
        });
        break;

      // ============ DEFAULT ============
      default:
        if (isBotMentioned) {
          await sock.sendMessage(jid, {
            text:
              `👋 Halo *${sender}*!\n\n` +
              `Ketik *menu* untuk daftar perintah.\n` +
              `Ketik *jasa* untuk layanan website.`,
          });
        }
        break;
    }
  } catch (error) {
    console.error("❗ Error handling message:", error);
  }
}

// ==========================================
// 💼 MENU JASA WEBSITE
// ==========================================
async function sendServiceMenu(sock, jid, sender) {
  const rows = config.services.map((s) => ({
    header: `${s.emoji} ${s.priceFormatted}`,
    title: s.name,
    description: s.description,
    id: `service_${s.id}`,
  }));

  // Pisahkan testing dan produksi
  const testingRows = rows.filter((r) => r.id === "service_testing");
  const productionRows = rows.filter((r) => r.id !== "service_testing");

  // Bangun sections
  const sections = [];

  if (testingRows.length > 0) {
    sections.push({
      title: "🧪 Testing (Developer Only)",
      highlight_label: "⚠️ DEV",
      rows: testingRows,
    });
  }

  sections.push({
    title: "💼 Paket Jasa Website",
    highlight_label: "QRIS Payment",
    rows: productionRows,
  });

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  💼 *JASA PEMBUATAN WEB*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n\n` +
      (testingRows.length > 0 ? `🧪 *Testing Payment* — Rp 5 ⚠️\n` : ``) +
      `🌐 *Landing Page Starter* — Rp 1.400.000\n` +
      `⚙️ *Custom Dynamic Web* — Rp 2.500.000\n` +
      `🚀 *Full-Service Premium* — Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan dilakukan di *private chat*\n\n` +
      `Pilih paket di bawah 👇`,
    title: "Jasa Pembuatan Website",
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Paket Website",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// 💼 DETAIL SERVICE
// ✅ Jika dari group → redirect ke private
// ==========================================
async function sendServiceDetail(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // ✅ Jika dari GROUP → redirect ke private chat
  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    // Balas singkat di group
    await sock.sendMessage(jid, {
      text:
        `👋 Halo *${sender}*!\n\n` +
        `🔒 Untuk keamanan & privasi, proses pemesanan\n` +
        `dilanjutkan di *private chat*.\n\n` +
        `📩 Silakan cek chat pribadi kamu! 👇`,
    });

    // Kirim detail ke private
    await sendServiceDetailPrivate(
      sock,
      privateJid,
      sender,
      senderNumber,
      serviceId,
    );
    return;
  }

  // Dari private → langsung tampilkan
  await sendServiceDetailPrivate(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 💼 DETAIL SERVICE — PRIVATE CHAT (inti)
// ==========================================
async function sendServiceDetailPrivate(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
) {
  const service = getServiceById(serviceId);
  if (!service) return;

  // Cek pending order
  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *PESANAN PENDING*\n\n` +
        `Kamu masih punya pesanan belum dibayar:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n` +
        `💰 Total: *${pakasir.formatRupiah(existingOrder.totalPayment)}*\n\n` +
        `Ketik */cek* untuk cek status pembayaran.\n` +
        `Atau tunggu expired untuk pesan baru.`,
    });
    return;
  }

  const featureList = service.features.join("\n");

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ${service.emoji} *DETAIL PAKET*         ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 *${service.name}*\n` +
      `💰 *Harga: ${service.priceFormatted}*\n\n` +
      `📝 *Deskripsi:*\n${service.description}\n\n` +
      `🎯 *Fitur:*\n${featureList}\n\n` +
      `💳 *Pembayaran:* QRIS\n` +
      `⏰ *Masa berlaku:* ${config.pakasir.expiredMinutes} menit\n\n` +
      `Tekan tombol di bawah untuk melanjutkan 👇`,
    title: service.name,
    footer: `© 2024 ${config.botName}`,
    interactiveButtons: [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: `✅ Bayar ${service.priceFormatted}`,
          id: `confirm_${serviceId}`,
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "❌ Batal",
          id: "cancel_order",
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "📋 Lihat Paket Lain",
          id: "menu_jasa",
        }),
      },
    ],
  });
}

// ==========================================
// 💳 KONFIRMASI PEMBAYARAN
// ✅ Selalu redirect ke private chat
// ==========================================
async function handleConfirmPayment(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // ✅ Jika dari GROUP → redirect ke private
  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `🔒 Proses pembayaran dilakukan di *private chat*.\n` +
        `Cek chat pribadi kamu! 👇`,
    });

    await processPayment(sock, privateJid, sender, senderNumber, serviceId);
    return;
  }

  // Dari private → langsung proses
  await processPayment(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 💳 PROSES PEMBAYARAN — SELALU PRIVATE
// ==========================================
async function processPayment(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) return;

  // Cek pending order
  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ Masih ada pesanan pending:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n\n` +
        `Ketik */cek* untuk cek status.`,
    });
    return;
  }

  // Kirim loading
  await sock.sendMessage(jid, {
    text:
      `⏳ *Membuat pembayaran QRIS...*\n\n` +
      `💼 ${service.name}\n` +
      `💰 ${service.priceFormatted}\n\n` +
      `Mohon tunggu...`,
  });

  // Buat order di DB
  // ✅ buyerJid = private JID bukan group JID
  const order = pakasir.createOrder({
    serviceId: service.id,
    serviceName: service.name,
    amount: service.price,
    buyerJid: jid,
    buyerNumber: senderNumber,
    buyerName: sender,
  });

  // ==========================================
  // Panggil Pakasir API
  // POST /api/transactioncreate/qris
  // ==========================================
  const result = await pakasir.createTransaction(
    order.orderId,
    service.price,
    "qris",
  );

  if (result.success && result.payment) {
    // ✅ BERHASIL
    const payment = result.payment;
    const totalPayment = payment.total_payment || service.price;
    const fee = payment.fee || 0;

    // Update order
    pakasir.updateOrder(order.orderId, {
      fee,
      totalPayment,
      paymentMethod: payment.payment_method || "qris",
      paymentNumber: payment.payment_number || null,
      expiredAt: payment.expired_at || order.expiredAt,
    });

    // ==========================================
    // QRIS → Generate gambar dari QR string
    // ==========================================
    if (payment.payment_number && payment.payment_method === "qris") {
      const qrBuffer = await pakasir.generateQRImage(payment.payment_number);

      if (qrBuffer) {
        // ✅ Kirim gambar QR ke PRIVATE CHAT
        const sentMsg = await sock.sendMessage(jid, {
          image: qrBuffer,
          caption:
            `╔══════════════════════════╗\n` +
            `║  💳 *PEMBAYARAN QRIS*     ║\n` +
            `╚══════════════════════════╝\n\n` +
            `📦 *Order ID:* ${order.orderId}\n` +
            `💼 *Jasa:* ${service.name}\n` +
            `💰 *Harga:* ${service.priceFormatted}\n` +
            (fee > 0
              ? `💸 *Biaya admin:* ${pakasir.formatRupiah(fee)}\n`
              : ``) +
            `💵 *Total bayar:* *${pakasir.formatRupiah(totalPayment)}*\n` +
            `👤 *Pemesan:* ${sender}\n\n` +
            `📱 *Cara Bayar:*\n` +
            `1. Buka e-wallet / m-banking\n` +
            `2. Pilih Scan QR / QRIS\n` +
            `3. Scan QR code di atas\n` +
            `4. Bayar sebesar *${pakasir.formatRupiah(totalPayment)}*\n\n` +
            `⏰ *Berlaku sampai:*\n${pakasir.formatDate(payment.expired_at)}\n\n` +
            `📋 Ketik */cek* setelah bayar untuk verifikasi`,
        });

        // ✅ Simpan messageKey untuk di-delete nanti
        if (sentMsg?.key) {
          pakasir.updateOrder(order.orderId, {
            qrisMessageKey: sentMsg.key,
          });
          console.log(
            `💾 QRIS message key saved: ${JSON.stringify(sentMsg.key)}`,
          );
        }
      } else {
        // Fallback: gagal generate gambar → kirim link
        const payUrl = pakasir.getPaymentUrl(
          order.orderId,
          service.price,
          true,
        );
        const sentMsg = await sock.sendMessage(jid, {
          text:
            `💳 *PEMBAYARAN QRIS*\n\n` +
            `📦 Order: *${order.orderId}*\n` +
            `💼 Jasa: *${service.name}*\n` +
            `💵 Total: *${pakasir.formatRupiah(totalPayment)}*\n\n` +
            `🔗 *Link Pembayaran:*\n${payUrl}\n\n` +
            `⏰ Berlaku: ${pakasir.formatDate(payment.expired_at)}\n\n` +
            `📋 Ketik */cek* setelah bayar`,
        });

        if (sentMsg?.key) {
          pakasir.updateOrder(order.orderId, {
            qrisMessageKey: sentMsg.key,
          });
        }
      }
    } else {
      // Non-QRIS (Virtual Account dll)
      const sentMsg = await sock.sendMessage(jid, {
        text:
          `╔══════════════════════════╗\n` +
          `║  💳 *PEMBAYARAN*          ║\n` +
          `╚══════════════════════════╝\n\n` +
          `📦 Order: *${order.orderId}*\n` +
          `💼 Jasa: *${service.name}*\n` +
          `💵 Total: *${pakasir.formatRupiah(totalPayment)}*\n\n` +
          `🏦 *Metode:* ${(payment.payment_method || "").toUpperCase()}\n` +
          `🔢 *Nomor VA:* \`${payment.payment_number}\`\n\n` +
          `⏰ Berlaku: ${pakasir.formatDate(payment.expired_at)}\n\n` +
          `📋 Ketik */cek* setelah bayar`,
      });

      if (sentMsg?.key) {
        pakasir.updateOrder(order.orderId, {
          qrisMessageKey: sentMsg.key,
        });
      }
    }

    // Notif ke owner: ada order baru
    await notifyOwnerNewOrder(
      sock,
      order,
      sender,
      senderNumber,
      service,
      result.payment,
    );

    console.log(`✅ Payment created: ${order.orderId} | ${senderNumber}`);
  } else {
    // ❌ GAGAL
    pakasir.updateOrder(order.orderId, { status: "failed" });

    const errorMsg = result.error || "Unknown error";
    const payUrl = pakasir.getPaymentUrl(order.orderId, service.price, true);

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMBUAT QRIS*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `❗ Error: ${errorMsg}\n\n` +
        `🔗 *Alternatif — bayar via link:*\n${payUrl}\n\n` +
        `Atau coba lagi nanti.\n` +
        `Ketik */jasa* untuk memesan ulang.`,
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🔄 Coba Lagi",
            id: `confirm_${serviceId}`,
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Menu Utama",
            id: "menu",
          }),
        },
      ],
    });

    // Notif error ke owner
    try {
      await sock.sendMessage(numberToJid(config.ownerNumber), {
        text:
          `⚠️ *PAYMENT ERROR*\n\n` +
          `📦 ${order.orderId}\n` +
          `💼 ${service.name}\n` +
          `👤 ${sender} (${senderNumber})\n` +
          `❗ ${errorMsg}`,
      });
    } catch (e) {}

    console.error(`❌ Payment failed: ${order.orderId} | ${errorMsg}`);
  }
}

// ==========================================
// 🚫 HANDLE CANCEL ORDER
// ==========================================
async function handleCancelOrder(sock, jid, senderNumber) {
  // Kalau dari group → proses & jawab di private
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  // Kalau dari group, kasih notif singkat di group
  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `🚫 Pembatalan diproses di *private chat* kamu.`,
    });
  }

  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (order) {
    // Cancel di Pakasir
    await pakasir.cancelTransaction(order.orderId, order.amount);

    // Update status
    pakasir.updateOrder(order.orderId, { status: "cancelled" });

    // Delete pesan QRIS jika ada
    if (order.qrisMessageKey) {
      try {
        await sock.sendMessage(order.buyerJid, {
          delete: order.qrisMessageKey,
        });
        console.log(`🗑️ QRIS message deleted on cancel: ${order.orderId}`);
      } catch (e) {
        console.error(`❌ Gagal delete QRIS on cancel:`, e.message);
      }
    }

    await sock.sendMessage(targetJid, {
      text:
        `🚫 *PESANAN DIBATALKAN*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `💼 Jasa: ${order.serviceName}\n\n` +
        `Ketik *menu* untuk kembali ke menu utama.`,
    });

    console.log(`🚫 Order cancelled: ${order.orderId} by ${senderNumber}`);
  } else {
    await sock.sendMessage(targetJid, {
      text: `🚫 Tidak ada pesanan aktif untuk dibatalkan.\nKetik *menu* untuk kembali.`,
    });
  }
}

// ==========================================
// 🔍 CEK PEMBAYARAN
// ✅ Jawab di private chat jika dari group
// ==========================================
async function handleCheckPayment(sock, jid, senderNumber) {
  // Target jawab
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  // Kasih notif singkat di group
  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `🔍 Status pembayaran dikirim ke *private chat* kamu!`,
    });
  }

  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (!order) {
    // Tidak ada pending → cek riwayat terakhir
    const orders = pakasir.loadOrders();
    const lastOrder = orders
      .filter((o) => o.buyerNumber === senderNumber)
      .pop();

    if (lastOrder) {
      await sock.sendMessage(targetJid, {
        text:
          `📋 *PESANAN TERAKHIR*\n\n` +
          `📦 Order: *${lastOrder.orderId}*\n` +
          `💼 Jasa: *${lastOrder.serviceName}*\n` +
          `💰 Total: *${pakasir.formatRupiah(lastOrder.totalPayment)}*\n` +
          `${pakasir.statusEmoji(lastOrder.status)} Status: *${pakasir.statusLabel(lastOrder.status)}*\n` +
          (lastOrder.completedAt
            ? `\n✅ Dibayar: ${pakasir.formatDate(lastOrder.completedAt)}`
            : ``) +
          `\n\nKetik */jasa* untuk pesanan baru.`,
      });
    } else {
      await sock.sendMessage(targetJid, {
        text: `📋 Belum ada pesanan.\nKetik */jasa* untuk melihat layanan.`,
      });
    }
    return;
  }

  // Cek expired lokal
  if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
    pakasir.updateOrder(order.orderId, { status: "expired" });
    await sock.sendMessage(targetJid, {
      text:
        `⏰ *PEMBAYARAN EXPIRED*\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n\n` +
        `QRIS sudah tidak berlaku.\n` +
        `Ketik */jasa* untuk pesan baru.`,
    });
    return;
  }

  // ✅ Cek via Pakasir Transaction Detail API
  const detail = await pakasir.getTransactionDetail(
    order.orderId,
    order.amount,
  );

  if (detail.success && detail.transaction) {
    const status = (detail.transaction.status || "").toLowerCase();

    if (status === "completed") {
      // ✅ LUNAS!
      pakasir.updateOrder(order.orderId, {
        status: "completed",
        completedAt:
          detail.transaction.completed_at || new Date().toISOString(),
      });

      await notifyPaymentSuccess(sock, pakasir.findOrderById(order.orderId));
      return;
    }
  }

  // Masih pending
  const timeLeft = order.expiredAt
    ? Math.max(0, Math.ceil((new Date(order.expiredAt) - new Date()) / 60000))
    : "?";

  await sock.sendMessage(targetJid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🔍 *STATUS PEMBAYARAN*   ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 Order: *${order.orderId}*\n` +
      `💼 Jasa: *${order.serviceName}*\n` +
      `💵 Total: *${pakasir.formatRupiah(order.totalPayment)}*\n` +
      `⏳ Status: *Menunggu Pembayaran*\n` +
      `⏰ Sisa waktu: *${timeLeft} menit*\n\n` +
      `Segera scan QRIS untuk menyelesaikan pembayaran.\n` +
      `Ketik */cek* lagi setelah bayar.`,
    interactiveButtons: [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🔄 Cek Ulang",
          id: "menu_cek_bayar",
        }),
      },
    ],
  });
}

// ==========================================
// 📋 RIWAYAT ORDER (USER)
// ==========================================
async function handleOrderHistory(sock, jid, senderNumber) {
  // Jawab di private jika dari group
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `📋 Riwayat pesanan dikirim ke *private chat* kamu!`,
    });
  }

  const orders = pakasir
    .loadOrders()
    .filter((o) => o.buyerNumber === senderNumber)
    .slice(-10)
    .reverse();

  if (orders.length === 0) {
    await sock.sendMessage(targetJid, {
      text:
        `📋 *RIWAYAT PESANAN*\n\n` +
        `_Belum ada pesanan._\n\n` +
        `Ketik */jasa* untuk mulai memesan.`,
    });
    return;
  }

  let text = `📋 *RIWAYAT PESANAN*\n\n`;

  orders.forEach((o, i) => {
    text +=
      `*${i + 1}. ${o.serviceName}*\n` +
      `   📦 ${o.orderId}\n` +
      `   💰 ${pakasir.formatRupiah(o.totalPayment)}\n` +
      `   ${pakasir.statusEmoji(o.status)} ${pakasir.statusLabel(o.status)}\n` +
      `   📅 ${pakasir.formatDate(o.createdAt)}\n\n`;
  });

  text += `_Menampilkan ${orders.length} pesanan terakhir_`;

  await sock.sendMessage(targetJid, { text });
}

// ==========================================
// 📋 ADMIN: LIST SEMUA ORDER
// ==========================================
async function handleAdminListOrders(sock, jid) {
  const orders = pakasir.getAllOrders(15);

  if (orders.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *DAFTAR ORDER*\n\n_Belum ada order._`,
    });
    return;
  }

  const all = pakasir.loadOrders();
  const completed = all.filter((o) => o.status === "completed").length;
  const pending = all.filter((o) => o.status === "pending").length;
  const revenue = all
    .filter((o) => o.status === "completed")
    .reduce((s, o) => s + o.amount, 0);

  let text =
    `╔══════════════════════════╗\n` +
    `║  📋 *DAFTAR ORDER*       ║\n` +
    `╚══════════════════════════╝\n\n` +
    `📊 *Ringkasan:*\n` +
    `├ ✅ Lunas: ${completed}\n` +
    `├ ⏳ Pending: ${pending}\n` +
    `├ 📦 Total: ${all.length}\n` +
    `└ 💰 Revenue: ${pakasir.formatRupiah(revenue)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  orders.forEach((o, i) => {
    text +=
      `*${i + 1}. ${o.orderId}*\n` +
      `   💼 ${o.serviceName}\n` +
      `   💰 ${pakasir.formatRupiah(o.amount)}\n` +
      `   👤 ${o.buyerName} (${o.buyerNumber})\n` +
      `   ${pakasir.statusEmoji(o.status)} ${pakasir.statusLabel(o.status)}\n` +
      `   📅 ${pakasir.formatDate(o.createdAt)}\n\n`;
  });

  text += `_Menampilkan ${orders.length} order terakhir_`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// 🔔 NOTIF OWNER: PESANAN BARU
// ==========================================
async function notifyOwnerNewOrder(
  sock,
  order,
  buyerName,
  buyerNumber,
  service,
  payment,
) {
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `╔══════════════════════════╗\n` +
        `║  🆕 *PESANAN BARU!*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${service.name}*\n` +
        `💰 Harga: *${service.priceFormatted}*\n` +
        (payment?.fee ? `💸 Fee: ${pakasir.formatRupiah(payment.fee)}\n` : ``) +
        `💵 Total: *${pakasir.formatRupiah(payment?.total_payment || service.price)}*\n\n` +
        `👤 *Pemesan:*\n` +
        `├ Nama: ${buyerName}\n` +
        `└ HP: ${buyerNumber}\n\n` +
        `⏳ Status: Menunggu Pembayaran\n` +
        `⏰ Expired: ${pakasir.formatDate(payment?.expired_at || order.expiredAt)}`,
    });
  } catch (err) {
    console.error("❌ Gagal notif owner (new order):", err.message);
  }
}

// ==========================================
// ✅ NOTIF PEMBAYARAN BERHASIL
// 1. Delete pesan QRIS (private)
// 2. Kirim notif sukses ke buyer (private)
// 3. Kirim notif sukses ke owner (private)
// ==========================================
async function notifyPaymentSuccess(sock, order) {
  if (!order) return;

  console.log(`\n🎉 ═══════════════════════════════════════`);
  console.log(`🎉 PAYMENT SUCCESS: ${order.orderId}`);
  console.log(`🎉 Buyer: ${order.buyerName} (${order.buyerNumber})`);
  console.log(`🎉 ═══════════════════════════════════════\n`);

  // ==========================================
  // STEP 1: DELETE PESAN QRIS
  // buyerJid sudah private karena disimpan saat processPayment
  // ==========================================
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS message deleted: ${order.orderId}`);
    } catch (err) {
      console.error(`❌ Gagal delete QRIS message:`, err.message);
      // Lanjut meski gagal delete
    }

    // Jeda sebentar setelah delete
    await delay(1500);
  }

  // ==========================================
  // STEP 2: KIRIM NOTIF SUKSES KE BUYER (PRIVATE)
  // ==========================================
  try {
    await sock.sendMessage(order.buyerJid, {
      text:
        `╔══════════════════════════╗\n` +
        `║  ✅ *PEMBAYARAN BERHASIL!* ║\n` +
        `╚══════════════════════════╝\n\n` +
        `Terima kasih! 🎉\n\n` +
        `📦 *Order:* ${order.orderId}\n` +
        `💼 *Jasa:* ${order.serviceName}\n` +
        `💰 *Total:* *${pakasir.formatRupiah(order.totalPayment)}*\n` +
        `✅ *Status:* Lunas\n` +
        `📅 *Dibayar:* ${pakasir.formatDate(order.completedAt)}\n\n` +
        `📌 *Langkah selanjutnya:*\n` +
        `Tim kami akan segera menghubungi Anda\n` +
        `untuk memulai pengerjaan project.\n\n` +
        `Terima kasih telah mempercayakan\n` +
        `project Anda kepada kami! 🙏`,
    });

    pakasir.updateOrder(order.orderId, { notifiedBuyer: true });
    console.log(`✅ Buyer notified: ${order.buyerNumber}`);
  } catch (err) {
    console.error("❌ Gagal notif buyer:", err.message);
  }

  // ==========================================
  // STEP 3: KIRIM NOTIF KE OWNER (PRIVATE)
  // ==========================================
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `╔══════════════════════════╗\n` +
        `║  💰 *PEMBAYARAN MASUK!*   ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n` +
        `💰 Jumlah: *${pakasir.formatRupiah(order.totalPayment)}*\n\n` +
        `👤 *Dari:*\n` +
        `├ Nama: ${order.buyerName}\n` +
        `└ HP: ${order.buyerNumber}\n\n` +
        `✅ Status: Lunas\n` +
        `📅 Waktu: ${pakasir.formatDate(order.completedAt)}\n\n` +
        `💡 Segera hubungi client untuk mulai pengerjaan.`,
    });

    pakasir.updateOrder(order.orderId, { notifiedSeller: true });
    console.log(`✅ Owner notified`);
  } catch (err) {
    console.error("❌ Gagal notif owner:", err.message);
  }

  console.log(`✅ Payment SUCCESS flow done: ${order.orderId}`);
}

// ==========================================
// ❌ NOTIF PEMBAYARAN GAGAL / EXPIRED
// ==========================================
async function notifyPaymentFailed(sock, order, reason = "expired") {
  if (!order) return;

  const reasonText =
    reason === "expired"
      ? "QRIS telah kedaluwarsa"
      : reason === "cancelled"
        ? "Pembayaran dibatalkan"
        : "Pembayaran gagal diproses";

  const emoji =
    reason === "expired" ? "⏰" : reason === "cancelled" ? "🚫" : "❌";

  // Delete pesan QRIS jika ada
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS message deleted (${reason}): ${order.orderId}`);
    } catch (e) {}
    await delay(500);
  }

  // Notif ke buyer (private)
  try {
    await sock.sendMessage(order.buyerJid, {
      text:
        `${emoji} *PEMBAYARAN ${reason.toUpperCase()}*\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n` +
        `💰 Total: ${pakasir.formatRupiah(order.totalPayment)}\n\n` +
        `❗ ${reasonText}\n\n` +
        `Ketik */jasa* untuk pesan ulang.`,
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🔄 Pesan Ulang",
            id: "menu_jasa",
          }),
        },
      ],
    });
  } catch (e) {
    console.error("❌ Gagal notif buyer (failed):", e.message);
  }

  // Notif ke owner
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `${emoji} *PEMBAYARAN ${reason.toUpperCase()}*\n\n` +
        `📦 ${order.orderId}\n` +
        `💼 ${order.serviceName}\n` +
        `👤 ${order.buyerName} (${order.buyerNumber})\n` +
        `❗ ${reasonText}`,
    });
  } catch (e) {}

  console.log(`${emoji} Payment ${reason}: ${order.orderId}`);
}

// ==========================================
// EXTRACT TEXT DARI BERBAGAI FORMAT PESAN
// ==========================================
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.buttonsResponseMessage?.selectedButtonId)
    return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId)
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.templateButtonReplyMessage?.selectedId)
    return m.templateButtonReplyMessage.selectedId;
  if (m.interactiveResponseMessage) {
    try {
      const body =
        m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
      if (body) return JSON.parse(body).id || "";
    } catch (e) {}
  }
  return "";
}

// ==========================================
// CEK BOT DI-MENTION
// ==========================================
function checkBotMentioned(msg, botNumber) {
  const m = msg.message;
  if (!m) return false;
  const mentions = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.some((j) => j.startsWith(botNumber))) return true;
  const t = m.conversation || m.extendedTextMessage?.text || "";
  return t.includes(`@${botNumber}`);
}

// ==========================================
// ⭐ MENU UTAMA — INTERACTIVE LIST
// ==========================================
async function sendMainMenu(sock, jid, sender, senderNumber) {
  const hasTestingService = config.services.some((s) => s.id === "testing");

  const sections = [];

  // Testing section (jika ada)
  if (hasTestingService) {
    sections.push({
      title: "🧪 Testing Payment",
      highlight_label: "⚠️ DEV",
      rows: [
        {
          header: "🧪 Rp 5",
          title: "⚠️ Testing Payment",
          description: "Test pembayaran QRIS — Rp 5 saja",
          id: "service_testing",
        },
      ],
    });
  }

  sections.push(
    {
      title: "💼 Jasa Pembuatan Website",
      highlight_label: "🔥 Baru",
      rows: [
        {
          header: "🌐 Rp 1.400.000",
          title: "Landing Page Starter",
          description: "Landing page responsif profesional",
          id: "service_landing",
        },
        {
          header: "⚙️ Rp 2.500.000",
          title: "Custom Dynamic Web",
          description: "Website dinamis multi-halaman + CMS",
          id: "service_custom",
        },
        {
          header: "🚀 Rp 3.500.000",
          title: "Full-Service Premium Web",
          description: "Website full-fitur + maintenance",
          id: "service_premium",
        },
      ],
    },
    {
      title: "💳 Pembayaran",
      rows: [
        {
          header: "🔍 Status",
          title: "Cek Pembayaran",
          description: "Cek status pembayaran aktif",
          id: "menu_cek_bayar",
        },
        {
          header: "📋 History",
          title: "Riwayat Pesanan",
          description: "Lihat riwayat pesanan",
          id: "menu_riwayat",
        },
      ],
    },
    {
      title: "📨 Fitur Message",
      highlight_label: "Demo",
      rows: [
        {
          header: "🔘",
          title: "Button Message",
          description: "Tombol interaktif",
          id: "menu_button",
        },
        {
          header: "📋",
          title: "List Message",
          description: "Daftar pilihan",
          id: "menu_list",
        },
        {
          header: "📎",
          title: "Template Button",
          description: "URL, Call, Quick Reply",
          id: "menu_template",
        },
        {
          header: "🖼️",
          title: "Image + Button",
          description: "Gambar + tombol",
          id: "menu_image",
        },
      ],
    },
    {
      title: "ℹ️ Informasi",
      rows: [
        {
          header: "📌",
          title: "Info Bot",
          description: "Info lengkap bot",
          id: "menu_info",
        },
        {
          header: "👨‍💻",
          title: "Creator",
          description: "Pembuat bot",
          id: "menu_creator",
        },
        {
          header: "🏓",
          title: "Speed Test",
          description: "Cek response bot",
          id: "menu_ping",
        },
      ],
    },
  );

  // Admin section
  if (isAdminOrOwner(senderNumber)) {
    const admins = loadAdmins();
    const role = isOwner(senderNumber) ? "👑 Owner" : "🛡️ Admin";
    sections.push({
      title: `🔐 Admin Panel [${role}]`,
      highlight_label: "Restricted",
      rows: [
        {
          header: "➕",
          title: "Tambah Admin",
          description: "Tambah admin baru",
          id: "admin_add",
        },
        {
          header: "➖",
          title: "Hapus Admin",
          description: `Hapus admin (${admins.length})`,
          id: "admin_del",
        },
        {
          header: "📋",
          title: "Daftar Admin",
          description: "Lihat semua admin",
          id: "admin_list",
        },
        {
          header: "📦",
          title: "Daftar Pesanan",
          description: "Semua pesanan masuk",
          id: "admin_orders",
        },
      ],
    });
  }

  const roleText = isOwner(senderNumber)
    ? "👑 Owner"
    : isAdmin(senderNumber)
      ? "🛡️ Admin"
      : "👤 User";

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🤖 *MENU BOT WA*        ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n` +
      `Role: *${roleText}*\n\n` +
      `💼 *Jasa Pembuatan Website*\n` +
      (hasTestingService ? `├ 🧪 Testing — Rp 5 ⚠️\n` : ``) +
      `├ 🌐 Landing Page — Rp 1.400.000\n` +
      `├ ⚙️ Custom Web — Rp 2.500.000\n` +
      `└ 🚀 Premium Web — Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan di *private chat*\n\n` +
      `⏰ ${new Date().toLocaleString("id-ID")}\n\n` +
      `Pilih menu di bawah 👇`,
    title: config.botName,
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Buka Menu",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// BUTTON MESSAGE
// ==========================================
async function sendButtonMessage(sock, jid) {
  await sock.sendMessage(jid, {
    text: "🔘 *BUTTON MESSAGE*\n\nPilih tombol:",
    footer: "👇",
    buttons: [
      {
        buttonId: "btn_info",
        buttonText: { displayText: "📌 Info" },
        type: 1,
      },
      {
        buttonId: "btn_creator",
        buttonText: { displayText: "👨‍💻 Creator" },
        type: 1,
      },
      {
        buttonId: "btn_ping",
        buttonText: { displayText: "🏓 Ping" },
        type: 1,
      },
    ],
    headerType: 1,
  });
}

// ==========================================
// LIST MESSAGE
// ==========================================
async function sendListMessage(sock, jid) {
  await sock.sendMessage(jid, {
    text: "📋 *LIST MESSAGE*\n\nPilih dari daftar:",
    footer: "© 2024",
    title: "Menu",
    buttonText: "📋 Lihat Menu",
    sections: [
      {
        title: "🎮 Games",
        rows: [
          {
            title: "🎮 Games",
            rowId: "list_games",
            description: "Fitur game seru",
          },
        ],
      },
      {
        title: "🔧 Tools",
        rows: [
          {
            title: "🔧 Tools",
            rowId: "list_tools",
            description: "Tools berguna",
          },
        ],
      },
      {
        title: "📥 Downloader",
        rows: [
          {
            title: "📥 Downloader",
            rowId: "list_downloader",
            description: "Download video & audio",
          },
        ],
      },
      {
        title: "📋 Info",
        rows: [
          {
            title: "📋 Info Bot",
            rowId: "list_info",
            description: "Informasi bot",
          },
        ],
      },
    ],
  });
}

// ==========================================
// TEMPLATE BUTTON
// ==========================================
async function sendTemplateButton(sock, jid) {
  await sock.sendMessage(jid, {
    text:
      "📎 *TEMPLATE BUTTON*\n\n" +
      "• 🌐 URL Button\n" +
      "• 📞 Call Button\n" +
      "• 🔄 Quick Reply Button",
    footer: "© 2024",
    templateButtons: [
      {
        index: 1,
        urlButton: {
          displayText: "🌐 GitHub",
          url: "https://github.com/atex-ovi/atexovi-baileys",
        },
      },
      {
        index: 2,
        callButton: {
          displayText: "📞 Call",
          phoneNumber: "+6281234567890",
        },
      },
      {
        index: 3,
        quickReplyButton: {
          displayText: "🔄 Quick Reply",
          id: "btn_info",
        },
      },
    ],
  });
}

// ==========================================
// IMAGE + BUTTON
// ==========================================
async function sendImageWithButton(sock, jid) {
  await sock.sendMessage(jid, {
    image: { url: "https://picsum.photos/500/300" },
    caption: "🖼️ *IMAGE + BUTTON*\n\nContoh pesan gambar dengan button!",
    footer: "© 2024",
    buttons: [
      {
        buttonId: "btn_info",
        buttonText: { displayText: "📌 Info" },
        type: 1,
      },
      {
        buttonId: "btn_ping",
        buttonText: { displayText: "🏓 Ping" },
        type: 1,
      },
    ],
    headerType: 4,
  });
}

// ==========================================
// ADMIN: ADD ADMIN
// ==========================================
async function handleAddAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  let target = "";
  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length > 0) {
    target = getNumberFromJid(mentions[0]);
  } else {
    const parts = rawText.split(/\s+/);
    if (parts.length >= 2) target = normalizeNumber(parts[1]);
  }

  if (!target || target.length < 10) {
    await sock.sendMessage(jid, {
      text: "❌ Format: `/addadmin 628xxxxxxxxxx`",
    });
    return;
  }

  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: "👑 Nomor tersebut adalah Owner." });
    return;
  }

  if (isAdmin(target)) {
    await sock.sendMessage(jid, {
      text: `⚠️ *${target}* sudah menjadi admin.`,
    });
    return;
  }

  const admins = loadAdmins();
  admins.push(target);
  saveAdmins(admins);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN DITAMBAHKAN*\n\n` +
      `📱 Nomor: ${target}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: DEL ADMIN (dari command)
// ==========================================
async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const parts = rawText.split(/\s+/);
  let target = parts.length >= 2 ? normalizeNumber(parts[1]) : "";

  if (!target || target.length < 10) {
    await sock.sendMessage(jid, {
      text: "❌ Format: `/deladmin 628xxxxxxxxxx`",
    });
    return;
  }

  await executeDeleteAdmin(sock, jid, senderNumber, target);
}

// ==========================================
// ADMIN: DEL ADMIN (dari interactive list)
// ==========================================
async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  if (!isAdminOrOwner(senderNumber)) return;
  await executeDeleteAdmin(
    sock,
    jid,
    senderNumber,
    text.replace("deladmin_", ""),
  );
}

// ==========================================
// ADMIN: EXECUTE DELETE
// ==========================================
async function executeDeleteAdmin(sock, jid, senderNumber, target) {
  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: "⛔ Tidak bisa menghapus Owner.",
    });
    return;
  }

  if (!isAdmin(target)) {
    await sock.sendMessage(jid, {
      text: `❌ *${target}* bukan admin.`,
    });
    return;
  }

  if (normalizeNumber(senderNumber) === normalizeNumber(target)) {
    await sock.sendMessage(jid, {
      text: "❌ Tidak bisa menghapus diri sendiri.",
    });
    return;
  }

  let admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: ${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: LIST ADMIN
// ==========================================
async function sendAdminList(sock, jid) {
  const admins = loadAdmins();

  let text =
    `🔐 *DAFTAR ADMIN*\n\n` +
    `👑 *OWNER:*\n` +
    `└ 📱 ${config.ownerNumber}\n\n` +
    `🛡️ *ADMIN (${admins.length}):*\n`;

  if (admins.length === 0) {
    text += `└ _Belum ada admin_\n`;
  } else {
    admins.forEach((a, i) => {
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 ${a}\n`;
    });
  }

  text += `\n📊 Total: ${admins.length + 1} (termasuk owner)`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// ADMIN: SEND DELETE LIST (interactive)
// ==========================================
async function sendAdminDeleteList(sock, jid) {
  const admins = loadAdmins().filter((a) => !isOwner(a));

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `📋 *DELETE ADMIN*\n\n` +
        `_Belum ada admin untuk dihapus._\n\n` +
        `Tambah admin: \`/addadmin 628xxx\``,
    });
    return;
  }

  const rows = admins.map((a, i) => ({
    header: `Admin #${i + 1}`,
    title: a,
    description: `Hapus ${a} dari daftar admin`,
    id: `deladmin_${a}`,
  }));

  await sock.sendMessage(jid, {
    text:
      `🗑️ *DELETE ADMIN*\n\n` +
      `Pilih admin yang ingin dihapus.\n` +
      `Total: *${admins.length}*`,
    footer: "⚠️ Owner tidak bisa dihapus",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Admin",
          sections: [
            {
              title: "🛡️ Daftar Admin",
              rows,
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  handleMessage,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  numberToJid,
};
