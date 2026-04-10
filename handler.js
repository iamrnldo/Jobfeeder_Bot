// ==========================================
//  HANDLER.JS - Main Handler
//  Menu Utama, Fitur Message, Informasi
// ==========================================

const config = require("./config");
const fs = require("fs");
const path = require("path");

// ==========================================
// IMPORT SUB-HANDLERS
// ==========================================
const pemesanan = require("./handler_pemesanan");
const owner = require("./handler_owner");
const adminBot = require("./handler_admin");
const adminGroup = require("./handler_admin_group");

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
// CEK DYNAMIC CONFIRM PATTERN
// ==========================================
function isDynamicConfirm(text) {
  return text.startsWith("confirm_");
}

// ==========================================
// ROLE HELPERS — gabungan dari semua handler
// ==========================================
function isOwner(number) {
  return owner.isOwner(number);
}

function isAdminBot(number) {
  return owner.isAdminBot(number);
}

async function isAdminOrOwner(number) {
  return owner.isOwner(number) || owner.isAdminBot(number);
}

async function canAccessGroupManager(sock, number) {
  return adminGroup.canAccessGroupManager(sock, number);
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
    await adminBot.handleIncomingImage(sock, msg, jid, senderNumber);
    return;
  }

  // ==========================================
  // PARAMETERIZED COMMANDS
  // ==========================================

  // ── Owner: addadmin / deladmin ──────────
  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
    // Owner → handler_owner
    // Admin Bot → handler_admin
    if (isOwner(senderNumber)) {
      await owner.handleOwnerAddAdmin(sock, msg, jid, senderNumber, rawText);
    } else if (isAdminBot(senderNumber)) {
      await adminBot.handleAdminBotAdd(sock, msg, jid, senderNumber, rawText);
    } else {
      await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    }
    return;
  }

  if (text.startsWith("/deladmin ") || text.startsWith("deladmin ")) {
    if (isOwner(senderNumber)) {
      await owner.handleOwnerDelAdmin(sock, jid, senderNumber, rawText);
    } else if (isAdminBot(senderNumber)) {
      await adminBot.handleAdminBotDel(sock, jid, senderNumber, rawText);
    } else {
      await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    }
    return;
  }

  // ── Owner: hapus admin dari list ────────
  if (text.startsWith("owner_deladmin_")) {
    await owner.handleOwnerDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  // ── Admin Bot: hapus admin dari list ────
  if (text.startsWith("adminbot_deladmin_")) {
    await adminBot.handleAdminBotDelFromList(sock, jid, senderNumber, text);
    return;
  }

  // ── Owner router (button responses) ─────
  if (
    text === "owner_manage_admin" ||
    text === "owner_add_admin" ||
    text === "owner_list_admin" ||
    text === "owner_del_admin" ||
    text === "owner_orders" ||
    text === "owner_group_manager" ||
    text === "owner_banner" ||
    text === "owner_stats"
  ) {
    await owner.handleOwnerRouter(sock, msg, jid, senderNumber, text);
    return;
  }

  // ── Admin Bot router (button responses) ─
  if (
    text === "adminbot_list" ||
    text === "adminbot_add" ||
    text === "adminbot_del" ||
    text === "adminbot_orders" ||
    text === "adminbot_banner" ||
    text.startsWith("adminbot_")
  ) {
    await adminBot.handleAdminBotRouter(sock, msg, jid, senderNumber, text);
    return;
  }

  // ── Group admin commands ─────────────────
  if (text.startsWith("/promote") || text.startsWith("promote ")) {
    await adminGroup.handlePromoteCommand(sock, msg, jid, senderNumber);
    return;
  }

  if (text.startsWith("/demote") || text.startsWith("demote ")) {
    await adminGroup.handleDemoteCommand(sock, msg, jid, senderNumber);
    return;
  }

  // ── Group admin router ───────────────────
  if (
    text.startsWith("grpselect_") ||
    text.startsWith("grppromote_") ||
    text.startsWith("grpdemote_") ||
    text.startsWith("grpnotadmin_") ||
    text === "grpadmin_banner"
  ) {
    await adminGroup.handleGroupAdminRouter(
      sock,
      msg,
      jid,
      senderNumber,
      rawText,
    );
    return;
  }

  // ==========================================
  // DYNAMIC CONFIRM HANDLER
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
      // ========================================
      // 🏠 MENU UTAMA
      // ========================================
      case "menu":
      case "/menu":
      case "help":
      case "/help":
      case "menu_back":
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;

      // ========================================
      // 💼 JASA PEMESANAN
      // ========================================
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

      case "batalkan_pesanan":
      case "cancel_order":
        await pemesanan.handleCancelOrder(sock, jid, senderNumber);
        break;

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

      // ========================================
      // 👑 OWNER PANEL
      // ========================================
      case "owner":
      case "/owner":
      case "panel_owner": {
        if (!isOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Owner yang bisa akses panel ini.",
          });
          break;
        }
        // Tampilkan menu owner via sendMainMenu (sudah include owner section)
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;
      }

      // ========================================
      // 🛡️ ADMIN BOT PANEL
      // ========================================
      case "admin":
      case "/admin":
      case "panel_admin": {
        if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin Bot yang bisa akses panel ini.",
          });
          break;
        }
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;
      }

      // ── Admin Bot: tambah admin ──────────
      case "admin_add":
      case "adminbot_add": {
        if (isOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text:
              `➕ *TAMBAH ADMIN BOT*\n\n` +
              `Ketik:\n\`\`\`/addadmin 628xxxxxxxxxx\`\`\``,
          });
        } else if (isAdminBot(senderNumber)) {
          await adminBot.handleAdminBotRouter(
            sock,
            msg,
            jid,
            senderNumber,
            "adminbot_add",
          );
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      // ── Admin Bot: hapus admin ───────────
      case "admin_del":
      case "adminbot_del": {
        if (isOwner(senderNumber)) {
          await owner.handleOwnerRouter(
            sock,
            msg,
            jid,
            senderNumber,
            "owner_del_admin",
          );
        } else if (isAdminBot(senderNumber)) {
          await adminBot.handleAdminBotRouter(
            sock,
            msg,
            jid,
            senderNumber,
            "adminbot_del",
          );
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      // ── Admin Bot: list admin ────────────
      case "admin_list":
      case "adminbot_list":
      case "/listadmin":
      case "listadmin": {
        if (isOwner(senderNumber)) {
          await owner.handleOwnerListAdmin(sock, jid, senderNumber);
        } else if (isAdminBot(senderNumber)) {
          await adminBot.handleAdminBotList(sock, jid, senderNumber);
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      // ── Admin Bot / Owner: daftar order ──
      case "admin_orders":
      case "adminbot_orders":
      case "/listorder":
      case "listorder": {
        if (isOwner(senderNumber)) {
          await owner.handleOwnerListOrders(sock, jid, senderNumber);
        } else if (isAdminBot(senderNumber)) {
          await adminBot.handleAdminBotOrders(sock, jid, senderNumber);
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      // ========================================
      // 🖼️ EDIT BANNER
      // Owner + Admin Bot + Admin Group WA
      // ========================================
      case "admin_banner":
      case "adminbot_banner":
      case "grpadmin_banner":
      case "owner_banner":
      case "edit_banner": {
        const canEdit =
          isOwner(senderNumber) ||
          isAdminBot(senderNumber) ||
          (await adminGroup.canAccessGroupManager(sock, senderNumber));

        if (!canEdit) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await adminBot.handleEditBanner(sock, jid, senderNumber);
        break;
      }

      // ========================================
      // 👥 GROUP ADMIN MANAGER
      // Owner + Admin Bot + Admin Group WA
      // ========================================
      case "admin_group":
      case "group_manager": {
        const hasAccess = await adminGroup.canAccessGroupManager(
          sock,
          senderNumber,
        );
        if (!hasAccess) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await adminGroup.handleGroupManager(sock, jid, senderNumber);
        break;
      }

      case "grpadmin_promote": {
        const hasAccess = await adminGroup.canAccessGroupManager(
          sock,
          senderNumber,
        );
        if (!hasAccess) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await adminGroup.handleGroupSelectForAction(
          sock,
          jid,
          senderNumber,
          "promote",
        );
        break;
      }

      case "grpadmin_demote": {
        const hasAccess = await adminGroup.canAccessGroupManager(
          sock,
          senderNumber,
        );
        if (!hasAccess) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await adminGroup.handleGroupSelectForAction(
          sock,
          jid,
          senderNumber,
          "demote",
        );
        break;
      }

      case "grpadmin_view": {
        const hasAccess = await adminGroup.canAccessGroupManager(
          sock,
          senderNumber,
        );
        if (!hasAccess) {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
          break;
        }
        await adminGroup.handleGroupSelectForAction(
          sock,
          jid,
          senderNumber,
          "view",
        );
        break;
      }

      // ========================================
      // 📨 DEMO FITUR MESSAGE
      // ========================================
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

      // ========================================
      // ℹ️ INFORMASI
      // ========================================
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
        await sock.sendMessage(jid, { text: `🎮 *GAMES*\n\n_Coming Soon!_` });
        break;

      case "list_tools":
        await sock.sendMessage(jid, { text: `🔧 *TOOLS*\n\n_Coming Soon!_` });
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

      // ========================================
      // DEFAULT
      // ========================================
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
// ==========================================
async function sendMainMenu(sock, msg, jid, sender, senderNumber) {
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

  // ==========================================
  // ✅ PANEL SECTION BERDASARKAN ROLE
  // ==========================================

  // Owner Panel
  if (isOwner(senderNumber)) {
    sections.push(owner.getOwnerMenuSection());
  }

  // Admin Bot Panel (bukan owner)
  if (isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    sections.push(adminBot.getAdminBotMenuSection(senderNumber));
  }

  // Admin Group Panel
  // Cek async — ambil dulu, push jika memenuhi syarat
  const isGroupAdmin = await adminGroup.canAccessGroupManager(
    sock,
    senderNumber,
  );
  if (isGroupAdmin && !isOwner(senderNumber) && !isAdminBot(senderNumber)) {
    sections.push(adminGroup.getAdminGroupMenuSection());
  }

  // ==========================================
  // ROLE TEXT
  // ==========================================
  const roleText = isOwner(senderNumber)
    ? "👑 Owner"
    : isAdminBot(senderNumber)
      ? "🛡️ Admin Bot"
      : isGroupAdmin
        ? "👥 Admin Group"
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

  const bannerExists = fs.existsSync(BANNER_PATH);

  if (bannerExists) {
    try {
      const bannerBuffer = fs.readFileSync(BANNER_PATH);
      await sock.sendMessage(jid, {
        image: bannerBuffer,
        caption,
        ...interactivePayload,
      });
      console.log(
        `🖼️ Menu dikirim dengan banner (${senderNumber}) [${roleText}]`,
      );
      return;
    } catch (err) {
      console.error(`⚠️ Gagal kirim banner, fallback: ${err.message}`);
    }
  }

  await sock.sendMessage(jid, {
    text: caption,
    ...interactivePayload,
  });
  console.log(`📋 Menu dikirim text (${senderNumber}) [${roleText}]`);
}

// ==========================================
// 🔘 BUTTON MESSAGE
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
      { buttonId: "btn_info", buttonText: { displayText: "📌 Info" }, type: 1 },
      { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
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
