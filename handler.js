// ==========================================
//  HANDLER.JS - Frontend
//  Command, Menu, Admin, PAYMENT System
//  ✅ Sesuai dokumentasi Pakasir
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
    `📩 Pesan dari ${sender} (${senderNumber}): ${text || "[non-text]"}`,
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
      // ============ MENU ============
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

      // ============ MENU RESPONSES ============
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
            text: `👋 Halo *${sender}*!\n\nKetik *menu* untuk daftar perintah.\nKetik *jasa* untuk layanan website.`,
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

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  💼 *JASA PEMBUATAN WEB*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n\n` +
      `🌐 *Landing Page Starter* — Rp 1.400.000\n` +
      `⚙️ *Custom Dynamic Web* — Rp 2.500.000\n` +
      `🚀 *Full-Service Premium* — Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS* (semua e-wallet & bank)\n\n` +
      `Pilih paket di bawah 👇`,
    title: "Jasa Pembuatan Website",
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Paket Website",
          sections: [
            {
              title: "💼 Paket Jasa Website",
              highlight_label: "QRIS Payment",
              rows,
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// 💼 DETAIL SERVICE
// ==========================================
async function sendServiceDetail(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *PESANAN PENDING*\n\n` +
        `Kamu masih punya pesanan belum dibayar:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n` +
        `💰 Total: *${pakasir.formatRupiah(existingOrder.totalPayment)}*\n\n` +
        `Ketik */cek* untuk cek status.`,
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
// ✅ Sesuai Pakasir API: transactioncreate/qris
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

  // Cek pending
  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ Masih ada pesanan pending:\n` +
        `Order: *${existingOrder.orderId}*\n\n` +
        `Ketik */cek* untuk cek status.`,
    });
    return;
  }

  // Loading
  await sock.sendMessage(jid, {
    text:
      `⏳ *Membuat pembayaran QRIS...*\n\n` +
      `💼 ${service.name}\n` +
      `💰 ${service.priceFormatted}\n\n` +
      `Mohon tunggu...`,
  });

  // Buat order di DB
  const order = pakasir.createOrder({
    serviceId: service.id,
    serviceName: service.name,
    amount: service.price,
    buyerJid: jid,
    buyerNumber: senderNumber,
    buyerName: sender,
  });

  // ==========================================
  // ✅ PANGGIL PAKASIR API
  // POST https://app.pakasir.com/api/transactioncreate/qris
  // ==========================================
  const result = await pakasir.createTransaction(
    order.orderId,
    service.price,
    "qris",
  );

  if (result.success && result.payment) {
    // ==========================================
    // ✅ BERHASIL — Update order dengan data Pakasir
    // ==========================================
    const payment = result.payment;

    pakasir.updateOrder(order.orderId, {
      fee: payment.fee || 0,
      totalPayment: payment.total_payment || service.price,
      paymentMethod: payment.payment_method || "qris",
      paymentNumber: payment.payment_number || null,
      expiredAt: payment.expired_at || order.expiredAt,
    });

    const totalPayment = payment.total_payment || service.price;
    const fee = payment.fee || 0;

    // ==========================================
    // ✅ GENERATE QR IMAGE dari payment_number (QR string)
    // ==========================================
    if (payment.payment_number && payment.payment_method === "qris") {
      const qrBuffer = await pakasir.generateQRImage(payment.payment_number);

      if (qrBuffer) {
        // Kirim QR sebagai gambar
        await sock.sendMessage(jid, {
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
      } else {
        // Fallback: gagal generate QR → kirim link
        const payUrl = pakasir.getPaymentUrl(
          order.orderId,
          service.price,
          true,
        );
        await sock.sendMessage(jid, {
          text:
            `💳 *PEMBAYARAN QRIS*\n\n` +
            `📦 Order: *${order.orderId}*\n` +
            `💼 Jasa: *${service.name}*\n` +
            `💵 Total: *${pakasir.formatRupiah(totalPayment)}*\n\n` +
            `🔗 *Link Pembayaran:*\n${payUrl}\n\n` +
            `⏰ Berlaku: ${pakasir.formatDate(payment.expired_at)}\n\n` +
            `📋 Ketik */cek* setelah bayar`,
        });
      }
    } else {
      // Non-QRIS (VA dll) → kirim nomor VA
      await sock.sendMessage(jid, {
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
    }

    // Notif owner
    await notifyOwnerNewOrder(
      sock,
      order,
      sender,
      senderNumber,
      service,
      result.payment,
    );

    console.log(`✅ Payment created: ${order.orderId}`);
  } else {
    // ==========================================
    // ❌ GAGAL
    // ==========================================
    pakasir.updateOrder(order.orderId, { status: "failed" });

    const errorMsg = result.error || "Unknown error";

    // Buat payment link sebagai fallback
    const payUrl = pakasir.getPaymentUrl(order.orderId, service.price, true);

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMBUAT QRIS*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `❗ Error: ${errorMsg}\n\n` +
        `🔗 *Alternatif — bayar via link:*\n${payUrl}\n\n` +
        `Atau coba lagi nanti.\nKetik */jasa* untuk memesan ulang.`,
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
  }
}

// ==========================================
// 🚫 HANDLE CANCEL ORDER
// ==========================================
async function handleCancelOrder(sock, jid, senderNumber) {
  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (order) {
    // Cancel di Pakasir juga
    await pakasir.cancelTransaction(order.orderId, order.amount);

    pakasir.updateOrder(order.orderId, { status: "cancelled" });

    await sock.sendMessage(jid, {
      text:
        `🚫 *PESANAN DIBATALKAN*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `💼 Jasa: ${order.serviceName}\n\n` +
        `Ketik *menu* untuk kembali.`,
    });
  } else {
    await sock.sendMessage(jid, {
      text: `🚫 Tidak ada pesanan aktif untuk dibatalkan.\nKetik *menu* untuk kembali.`,
    });
  }
}

// ==========================================
// 🔍 CEK PEMBAYARAN
// ✅ Pakai Transaction Detail API
// ==========================================
async function handleCheckPayment(sock, jid, senderNumber) {
  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (!order) {
    const orders = pakasir.loadOrders();
    const lastOrder = orders
      .filter((o) => o.buyerNumber === senderNumber)
      .pop();

    if (lastOrder) {
      await sock.sendMessage(jid, {
        text:
          `📋 *PESANAN TERAKHIR*\n\n` +
          `📦 Order: *${lastOrder.orderId}*\n` +
          `💼 Jasa: *${lastOrder.serviceName}*\n` +
          `💰 Total: *${pakasir.formatRupiah(lastOrder.totalPayment)}*\n` +
          `${pakasir.statusEmoji(lastOrder.status)} Status: *${pakasir.statusLabel(lastOrder.status)}*\n` +
          (lastOrder.completedAt
            ? `\n✅ Dibayar: ${pakasir.formatDate(lastOrder.completedAt)}`
            : "") +
          `\n\nKetik */jasa* untuk pesanan baru.`,
      });
    } else {
      await sock.sendMessage(jid, {
        text: `📋 Belum ada pesanan.\nKetik */jasa* untuk melihat layanan.`,
      });
    }
    return;
  }

  // Cek expired lokal
  if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
    pakasir.updateOrder(order.orderId, { status: "expired" });
    await sock.sendMessage(jid, {
      text:
        `⏰ *PEMBAYARAN EXPIRED*\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n\n` +
        `QRIS sudah tidak berlaku.\nKetik */jasa* untuk pesan baru.`,
    });
    return;
  }

  // ✅ Cek via Pakasir Transaction Detail API
  const detail = await pakasir.getTransactionDetail(
    order.orderId,
    order.amount,
  );

  if (detail.success && detail.transaction) {
    const txn = detail.transaction;
    const status = (txn.status || "").toLowerCase();

    if (status === "completed") {
      // ✅ LUNAS!
      pakasir.updateOrder(order.orderId, {
        status: "completed",
        completedAt: txn.completed_at || new Date().toISOString(),
      });

      await notifyPaymentSuccess(sock, pakasir.findOrderById(order.orderId));
      return;
    }
  }

  // Masih pending
  const timeLeft = order.expiredAt
    ? Math.max(0, Math.ceil((new Date(order.expiredAt) - new Date()) / 60000))
    : "?";

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🔍 *STATUS PEMBAYARAN*   ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 Order: *${order.orderId}*\n` +
      `💼 Jasa: *${order.serviceName}*\n` +
      `💵 Total: *${pakasir.formatRupiah(order.totalPayment)}*\n` +
      `⏳ Status: *Menunggu Pembayaran*\n` +
      `⏰ Sisa waktu: *${timeLeft} menit*\n\n` +
      `Segera scan QRIS untuk bayar.\nKetik */cek* lagi setelah bayar.`,
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
  const orders = pakasir
    .loadOrders()
    .filter((o) => o.buyerNumber === senderNumber)
    .slice(-10)
    .reverse();

  if (orders.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *RIWAYAT PESANAN*\n\n_Belum ada pesanan._\nKetik */jasa* untuk mulai.`,
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

  await sock.sendMessage(jid, { text });
}

// ==========================================
// ADMIN: LIST ORDER
// ==========================================
async function handleAdminListOrders(sock, jid) {
  const orders = pakasir.getAllOrders(15);

  if (orders.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *DAFTAR ORDER*\n\n_Belum ada._`,
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
    `📋 *DAFTAR ORDER*\n\n` +
    `📊 *Ringkasan:*\n` +
    `├ ✅ Lunas: ${completed}\n` +
    `├ ⏳ Pending: ${pending}\n` +
    `├ 📦 Total: ${all.length}\n` +
    `└ 💰 Revenue: ${pakasir.formatRupiah(revenue)}\n\n`;

  orders.forEach((o, i) => {
    text +=
      `*${i + 1}. ${o.orderId}*\n` +
      `   💼 ${o.serviceName}\n` +
      `   💰 ${pakasir.formatRupiah(o.amount)}\n` +
      `   👤 ${o.buyerName} (${o.buyerNumber})\n` +
      `   ${pakasir.statusEmoji(o.status)} ${pakasir.statusLabel(o.status)}\n\n`;
  });

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
    console.error("❌ Gagal notif owner:", err.message);
  }
}

// ==========================================
// ✅ NOTIF PEMBAYARAN BERHASIL
// Dikirim ke BUYER dan OWNER
// ==========================================
async function notifyPaymentSuccess(sock, order) {
  if (!order) return;

  // ===== NOTIF KE BUYER =====
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
        `Tim kami akan segera menghubungi Anda untuk memulai pengerjaan.\n\n` +
        `Terima kasih! 🙏`,
    });
    pakasir.updateOrder(order.orderId, { notifiedBuyer: true });
  } catch (err) {
    console.error("❌ Gagal notif buyer:", err.message);
  }

  // ===== NOTIF KE OWNER =====
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
  } catch (err) {
    console.error("❌ Gagal notif owner:", err.message);
  }

  console.log(`✅ Payment SUCCESS: ${order.orderId} | ${order.buyerNumber}`);
}

// ==========================================
// ❌ NOTIF PEMBAYARAN GAGAL / EXPIRED
// ==========================================
async function notifyPaymentFailed(sock, order, reason = "expired") {
  if (!order) return;

  const reasonText =
    reason === "expired" ? "QRIS telah kedaluwarsa" : "Pembayaran gagal";
  const emoji = reason === "expired" ? "⏰" : "❌";

  // Buyer
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
  } catch (e) {}

  // Owner
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
}

// ==========================================
// EXTRACT TEXT
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

function checkBotMentioned(msg, botNumber) {
  const m = msg.message;
  if (!m) return false;
  const mentions = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.some((j) => j.startsWith(botNumber))) return true;
  let t = m.conversation || m.extendedTextMessage?.text || "";
  return t.includes(`@${botNumber}`);
}

// ==========================================
// MENU UTAMA
// ==========================================
async function sendMainMenu(sock, jid, sender, senderNumber) {
  const sections = [
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
  ];

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
      `├ 🌐 Landing Page — Rp 1.400.000\n` +
      `├ ⚙️ Custom Web — Rp 2.500.000\n` +
      `└ 🚀 Premium Web — Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS*\n\n` +
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
// BUTTON, LIST, TEMPLATE, IMAGE (sama)
// ==========================================
async function sendButtonMessage(sock, jid) {
  await sock.sendMessage(jid, {
    text: "🔘 *BUTTON MESSAGE*\n\nPilih tombol:",
    footer: "👇",
    buttons: [
      { buttonId: "btn_info", buttonText: { displayText: "📌 Info" }, type: 1 },
      {
        buttonId: "btn_creator",
        buttonText: { displayText: "👨‍💻 Creator" },
        type: 1,
      },
      { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
    ],
    headerType: 1,
  });
}

async function sendListMessage(sock, jid) {
  await sock.sendMessage(jid, {
    text: "📋 *LIST MESSAGE*",
    footer: "© 2024",
    title: "Menu",
    buttonText: "📋 Lihat Menu",
    sections: [
      {
        title: "🎮 Games",
        rows: [
          { title: "🎮 Games", rowId: "list_games", description: "Game seru" },
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
        title: "📥 DL",
        rows: [
          {
            title: "📥 Downloader",
            rowId: "list_downloader",
            description: "Download",
          },
        ],
      },
    ],
  });
}

async function sendTemplateButton(sock, jid) {
  await sock.sendMessage(jid, {
    text: "📎 *TEMPLATE BUTTON*",
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
        callButton: { displayText: "📞 Call", phoneNumber: "+6281234567890" },
      },
      {
        index: 3,
        quickReplyButton: { displayText: "🔄 Reply", id: "btn_info" },
      },
    ],
  });
}

async function sendImageWithButton(sock, jid) {
  await sock.sendMessage(jid, {
    image: { url: "https://picsum.photos/500/300" },
    caption: "🖼️ *IMAGE + BUTTON*",
    footer: "© 2024",
    buttons: [
      { buttonId: "btn_info", buttonText: { displayText: "📌 Info" }, type: 1 },
      { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
    ],
    headerType: 4,
  });
}

// ==========================================
// ADMIN FUNCTIONS
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
    await sock.sendMessage(jid, { text: "❌ Format: `/addadmin 628xxx`" });
    return;
  }
  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: "👑 Itu Owner." });
    return;
  }
  if (isAdmin(target)) {
    await sock.sendMessage(jid, { text: `⚠️ *${target}* sudah admin.` });
    return;
  }
  const admins = loadAdmins();
  admins.push(target);
  saveAdmins(admins);
  await sock.sendMessage(jid, {
    text: `✅ Admin ditambahkan: *${target}*\nTotal: ${admins.length}`,
  });
}

async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }
  const parts = rawText.split(/\s+/);
  let target = parts.length >= 2 ? normalizeNumber(parts[1]) : "";
  if (!target || target.length < 10) {
    await sock.sendMessage(jid, { text: "❌ Format: `/deladmin 628xxx`" });
    return;
  }
  await executeDeleteAdmin(sock, jid, senderNumber, target);
}

async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  if (!isAdminOrOwner(senderNumber)) return;
  await executeDeleteAdmin(
    sock,
    jid,
    senderNumber,
    text.replace("deladmin_", ""),
  );
}

async function executeDeleteAdmin(sock, jid, senderNumber, target) {
  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: "⛔ Tidak bisa hapus Owner." });
    return;
  }
  if (!isAdmin(target)) {
    await sock.sendMessage(jid, { text: `❌ *${target}* bukan admin.` });
    return;
  }
  if (normalizeNumber(senderNumber) === normalizeNumber(target)) {
    await sock.sendMessage(jid, { text: "❌ Tidak bisa hapus diri sendiri." });
    return;
  }
  let admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);
  await sock.sendMessage(jid, {
    text: `🗑️ Admin dihapus: *${target}*\nSisa: ${admins.length}`,
  });
}

async function sendAdminList(sock, jid) {
  const admins = loadAdmins();
  let text = `🔐 *DAFTAR ADMIN*\n\n👑 Owner: ${config.ownerNumber}\n\n🛡️ Admin (${admins.length}):\n`;
  if (admins.length === 0) text += `└ _Kosong_\n`;
  else
    admins.forEach((a, i) => {
      text += `${i === admins.length - 1 ? "└" : "├"} ${a}\n`;
    });
  text += `\nTotal: ${admins.length + 1}`;
  await sock.sendMessage(jid, { text });
}

async function sendAdminDeleteList(sock, jid) {
  const admins = loadAdmins().filter((a) => !isOwner(a));
  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text: "📋 _Tidak ada admin untuk dihapus._",
    });
    return;
  }
  const rows = admins.map((a, i) => ({
    header: `Admin #${i + 1}`,
    title: a,
    description: `Hapus ${a}`,
    id: `deladmin_${a}`,
  }));
  await sock.sendMessage(jid, {
    text: `🗑️ *HAPUS ADMIN*\n\nPilih admin:\nTotal: *${admins.length}*`,
    footer: "⚠️ Owner tidak bisa dihapus",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih",
          sections: [{ title: "Admin", rows }],
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
