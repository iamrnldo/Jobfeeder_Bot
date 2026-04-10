// ==========================================
//  HANDLER.JS - Main Handler
//  Menu Utama, Fitur Message, Informasi
// ==========================================

const config = require("./config");
const fs = require("fs");
const path = require("path");

// Import sub-handlers
const pemesanan = require("./handler_pemesanan");
const admin = require("./handler_admin");

// ==========================================
// PATH BANNER
// ==========================================
const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");

// ==========================================
// HELPERS
// ==========================================
function isGroupChat(jid) {
  return jid.endsWith("@g.us");
}

function getNumberFromJid(jid) {
  return jid.split("@")[0];
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
// ✅ CEK DYNAMIC CONFIRM PATTERN
// Handle: confirm_{serviceId}_{addonType}_{panelId}
// Contoh:
//   confirm_landing
//   confirm_custom
//   confirm_premium
//   confirm_bot_button_base_free
//   confirm_bot_button_qris_enano
//   confirm_bot_text_all_emedium
// ==========================================
function isDynamicConfirm(text) {
  return text.startsWith("confirm_");
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

  // ==========================================
  // HANDLE NON-TEXT
  // Cek gambar masuk untuk edit banner
  // ==========================================
  if (!text) {
    await admin.handleIncomingImage(sock, msg, jid, senderNumber);
    return;
  }

  // ==========================================
  // PARAMETERIZED COMMANDS
  // ==========================================

  // Bot admin management
  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
    await admin.handleAddAdmin(sock, msg, jid, senderNumber, rawText);
    return;
  }
  if (text.startsWith("/deladmin ") || text.startsWith("deladmin ")) {
    await admin.handleDelAdmin(sock, jid, senderNumber, rawText);
    return;
  }
  if (text.startsWith("deladmin_")) {
    await admin.handleDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  // Group admin command (/promote /demote) — hanya di group
  if (text.startsWith("/promote") || text.startsWith("promote ")) {
    await admin.handlePromoteCommand(sock, msg, jid, senderNumber);
    return;
  }
  if (text.startsWith("/demote") || text.startsWith("demote ")) {
    await admin.handleDemoteCommand(sock, msg, jid, senderNumber);
    return;
  }

  // Group admin manager — dynamic routing dari list button
  if (
    text.startsWith("grpselect_") ||
    text.startsWith("grppromote_") ||
    text.startsWith("grpdemote_") ||
    text.startsWith("grpnotadmin_")
  ) {
    await admin.handleGroupAdminRouter(sock, msg, jid, senderNumber, rawText);
    return;
  }

  // ==========================================
  // ✅ DYNAMIC CONFIRM HANDLER
  // Harus dicek SEBELUM switch-case
  // Handle semua format confirm_ secara dinamis
  // sehingga tidak perlu daftarkan satu-satu
  // ==========================================
  if (isDynamicConfirm(text)) {
    const fullServiceId = text.replace("confirm_", "");
    console.log(`💳 Dynamic confirm triggered: "${fullServiceId}"`);

    await pemesanan.handleConfirmPayment(
      sock,
      jid,
      sender,
      senderNumber,
      fullServiceId,
    );
    return;
  }

  // ==========================================
  // ROUTING COMMAND
  // ==========================================
  try {
    switch (text) {
      // ==========================================
      // 🏠 MENU UTAMA
      // ==========================================
      case "menu":
      case "/menu":
      case "help":
      case "/help":
      case "menu_back":
        await sendMainMenu(sock, jid, sender, senderNumber);
        break;

      // ==========================================
      // 💼 JASA PEMESANAN
      // ==========================================
      case "jasa":
      case "/jasa":
      case "website":
      case "/website":
      case "menu_jasa":
        await pemesanan.sendServiceMenu(sock, jid, sender);
        break;

      case "kategori_website":
        await pemesanan.sendServiceMenu(sock, jid, sender);
        break;

      case "kategori_botwa":
      case "menu_botwa":
        await pemesanan.sendBotWaMenu(sock, jid, sender);
        break;

      // ============ SERVICE SELECTION ============
      case "service_testing":
        await pemesanan.sendServiceDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "testing",
        );
        break;

      case "service_landing":
        await pemesanan.sendServiceDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "landing",
        );
        break;

      case "service_custom":
        await pemesanan.sendServiceDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "custom",
        );
        break;

      case "service_premium":
        await pemesanan.sendServiceDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "premium",
        );
        break;

      // ============ SERVICE SELECTION BOT WA ============
      case "service_bot_button":
        await pemesanan.sendBotWaDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "bot_button",
        );
        break;

      case "service_bot_text":
        await pemesanan.sendBotWaDetail(
          sock,
          jid,
          sender,
          senderNumber,
          "bot_text",
        );
        break;

      // ============ BATALKAN PESANAN ============
      case "batalkan_pesanan":
      case "cancel_order":
        await pemesanan.handleCancelOrder(sock, jid, senderNumber);
        break;

      // ============ CEK & RIWAYAT ============
      case "cek":
      case "/cek":
      case "cekbayar":
      case "/cekbayar":
      case "menu_cek_bayar":
        await pemesanan.handleCheckPayment(sock, jid, senderNumber);
        break;

      case "riwayat":
      case "/riwayat":
      case "history":
      case "/history":
      case "menu_riwayat":
        await pemesanan.handleOrderHistory(sock, jid, senderNumber);
        break;

      // ==========================================
      // 🔐 ADMIN PANEL — BOT ADMIN
      // ==========================================
      case "admin_add":
        if (!admin.isAdminOrOwner(senderNumber)) {
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
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.sendAdminDeleteList(sock, jid);
        break;

      case "admin_list":
      case "/listadmin":
      case "listadmin":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.sendAdminList(sock, jid);
        break;

      case "admin_orders":
      case "/listorder":
      case "listorder":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleAdminListOrders(sock, jid);
        break;

      // ==========================================
      // 🖼️ EDIT BANNER MENU
      // ==========================================
      case "admin_banner":
      case "edit_banner":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleEditBanner(sock, jid, senderNumber);
        break;

      // ==========================================
      // 👥 GROUP ADMIN MANAGER
      // ==========================================
      case "admin_group":
      case "group_manager":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleGroupManager(sock, jid, senderNumber);
        break;

      case "grpadmin_promote":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleGroupSelectForAction(
          sock,
          jid,
          senderNumber,
          "promote",
        );
        break;

      case "grpadmin_demote":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleGroupSelectForAction(
          sock,
          jid,
          senderNumber,
          "demote",
        );
        break;

      case "grpadmin_view":
        if (!admin.isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await admin.handleGroupSelectForAction(sock, jid, senderNumber, "view");
        break;

      // ==========================================
      // 📨 DEMO FITUR MESSAGE
      // ==========================================
      case "button":
      case "/button":
      case "menu_button":
        await sendButtonMessage(sock, jid);
        break;

      case "list":
      case "/list":
      case "menu_list":
        await sendListMessage(sock, jid);
        break;

      case "template":
      case "/template":
      case "menu_template":
        await sendTemplateButton(sock, jid);
        break;

      case "image":
      case "/image":
      case "menu_image":
        await sendImageWithButton(sock, jid);
        break;

      // ==========================================
      // ℹ️ INFORMASI
      // ==========================================
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

      case "menu_ping": {
        const ps = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 *PONG!*\nSpeed: ${Date.now() - ps}ms\nStatus: Online ✅`,
        });
        break;
      }

      case "menu_creator":
        await sock.sendMessage(jid, {
          text: `👨‍💻 *CREATOR*\n\nGitHub: https://github.com/iamrnldo`,
        });
        break;

      // ============ BUTTON / LIST RESPONSES ============
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

      case "btn_ping": {
        const s = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong! Speed: ${Date.now() - s}ms`,
        });
        break;
      }

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

      // ==========================================
      // DEFAULT
      // ==========================================
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

    // Debug: kirim error ke owner
    try {
      const { numberToJid } = require("./handler_pemesanan");
      await sock.sendMessage(numberToJid(config.ownerNumber), {
        text:
          `⚠️ *ERROR HANDLER*\n\n` +
          `📩 Text: ${text}\n` +
          `👤 From: ${senderNumber}\n` +
          `❗ Error: ${error.message}\n` +
          `📋 Stack: ${error.stack?.substring(0, 300)}`,
      });
    } catch (e) {}
  }
}

// ==========================================
// ⭐ MENU UTAMA
// Kirim banner_menu.jpg + interactive list
// Fallback ke text jika banner tidak ada
// ==========================================
async function sendMainMenu(sock, jid, sender, senderNumber) {
  const hasTestingService = config.services.some((s) => s.id === "testing");

  const sections = [];

  // Testing section
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
      title: "🛒 Pemesanan Jasa",
      highlight_label: "🔥 Tersedia",
      rows: [
        {
          header: "💼 Website",
          title: "Jasa Pembuatan Website",
          description: "Landing Page, Custom, Premium Web",
          id: "kategori_website",
        },
        {
          header: "🤖 Bot WA",
          title: "Jasa Pembuatan Bot WA",
          description: "Bot Button / Text + Addon QRIS & Image",
          id: "kategori_botwa",
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
  if (admin.isAdminOrOwner(senderNumber)) {
    sections.push(admin.getAdminMenuSection(senderNumber));
  }

  const roleText = admin.isOwner(senderNumber)
    ? "👑 Owner"
    : admin.isAdmin(senderNumber)
      ? "🛡️ Admin"
      : "👤 User";

  const caption =
    `╔══════════════════════════╗\n` +
    `║  🤖 *MENU BOT WA*        ║\n` +
    `╚══════════════════════════╝\n\n` +
    `Halo *${sender}*! 👋\n` +
    `Role: *${roleText}*\n\n` +
    `🛒 *Jasa Pemesanan Website*\n` +
    `└ Pilih dari menu untuk lihat paket\n\n` +
    `💳 Pembayaran via *QRIS*\n` +
    `🔒 Pemesanan di *private chat*\n\n` +
    `⏰ ${new Date().toLocaleString("id-ID")}\n\n` +
    `Pilih menu di bawah 👇`;

  const interactivePayload = {
    title: config.botName,
    footer: `© 2026 ${config.botName} | Pakasir QRIS`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Buka Menu",
          sections,
        }),
      },
    ],
  };

  // Cek banner
  const bannerExists = fs.existsSync(BANNER_PATH);

  if (bannerExists) {
    try {
      const bannerBuffer = fs.readFileSync(BANNER_PATH);
      await sock.sendMessage(jid, {
        image: bannerBuffer,
        caption,
        ...interactivePayload,
      });
      console.log(`🖼️ Menu dikirim dengan banner (${senderNumber})`);
      return;
    } catch (err) {
      console.error(`⚠️ Gagal kirim banner, fallback: ${err.message}`);
    }
  } else {
    console.log(`📋 Banner tidak ada, kirim text (${senderNumber})`);
  }

  // Fallback text
  await sock.sendMessage(jid, {
    text: caption,
    ...interactivePayload,
  });
}

// ==========================================
// 🔘 BUTTON MESSAGE
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
// 📋 LIST MESSAGE
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
// 📎 TEMPLATE BUTTON
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
// 🖼️ IMAGE + BUTTON
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
// EXPORT
// ==========================================
module.exports = {
  handleMessage,
};
