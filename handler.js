// ==========================================
//  HANDLER.JS - Main Handler
// ==========================================

const config = require("./config");
const fs = require("fs");
const path = require("path");

const announce = require("./handler_groupannounce");
const pemesanan = require("./handler_pemesanan");
const owner = require("./handler_owner");
const adminBot = require("./handler_admin");
const adminGroup = require("./handler_admin_group");
const { getLidMapSize, getLidMapEntries, isLidJid } = require("./lid_resolver");

const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");

function isGroupChat(jid) {
  return jid.endsWith("@g.us");
}

function isPrivateChat(jid) {
  return jid.endsWith("@s.whatsapp.net");
}

function getNumberFromJid(jid) {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0];
}

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
  const t = m.conversation || m.extendedTextMessage?.text || "";
  return t.includes(`@${botNumber}`);
}

function isDynamicConfirm(text) {
  return text.startsWith("confirm_");
}

function isOwner(number) {
  return owner.isOwner(number);
}

function isAdminBot(number) {
  return owner.isAdminBot(number);
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

  const rawParticipant = msg.key.participant || msg.key.remoteJid;
  const senderNumber = getNumberFromJid(rawParticipant);

  let text = extractText(msg);
  let rawText = text.trim();
  text = text.toLowerCase().trim();

  const isBotMentioned = checkBotMentioned(msg, botNumber);
  const isPrivate = isPrivateChat(jid);

  console.log(
    `📩 [${isGroupChat(jid) ? "GROUP" : "PRIVATE"}] ` +
      `${sender} (raw:${rawParticipant} → num:${senderNumber}): ` +
      `${text || "[non-text]"}`,
  );

  // ── Handle non-text (foto, video, audio, file) ──
  if (!text) {
    // ✅ Cek announce state DULU — hanya di private chat
    if (isPrivate && announce.announceState.has(senderNumber)) {
      const handled = await announce.handleAnnounceIncoming(
        sock,
        msg,
        jid,
        senderNumber,
      );
      if (handled) return;
    }

    await adminBot.handleIncomingImage(sock, msg, jid, senderNumber);
    return;
  }

  // ==========================================
  // PARAMETERIZED COMMANDS
  // ==========================================

  // ✅ Announce state handler — hanya di private chat
  if (isPrivate && announce.announceState.has(senderNumber)) {
    const handled = await announce.handleAnnounceIncoming(
      sock,
      msg,
      jid,
      senderNumber,
    );
    if (handled) return;
  }

  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
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
      await owner.handleOwnerDelAdmin(sock, msg, jid, senderNumber, rawText);
    } else if (isAdminBot(senderNumber)) {
      await adminBot.handleAdminBotDel(sock, jid, senderNumber, rawText);
    } else {
      await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    }
    return;
  }

  if (text.startsWith("owner_deladmin_")) {
    await owner.handleOwnerDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  if (text.startsWith("adminbot_deladmin_")) {
    await adminBot.handleAdminBotDelFromList(sock, jid, senderNumber, text);
    return;
  }

  // ── Announce router — hanya private chat ──
  if (
    isPrivate &&
    (text === "announce_start" ||
      text === "announce_select_all" ||
      text === "announce_deselect_all" ||
      text === "announce_need_select" ||
      text === "announce_next_compose" ||
      text === "announce_recompose" ||
      text === "announce_reselect" ||
      text === "announce_send" ||
      text === "announce_cancel" ||
      text === "announce_history" ||
      text.startsWith("announce_toggle_"))
  ) {
    await announce.handleAnnounceRouter(sock, msg, jid, senderNumber, text);
    return;
  }

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

  if (text.startsWith("/promote") || text.startsWith("promote ")) {
    await adminGroup.handlePromoteCommand(sock, msg, jid, senderNumber);
    return;
  }

  if (text.startsWith("/demote") || text.startsWith("demote ")) {
    await adminGroup.handleDemoteCommand(sock, msg, jid, senderNumber);
    return;
  }

  if (text.startsWith("/kick") || text.startsWith("kick ")) {
    await adminGroup.handleKickCommand(sock, msg, jid, senderNumber);
    return;
  }

  if (text.startsWith("/add ") || text.startsWith("add ")) {
    await adminGroup.handleAddCommand(sock, msg, jid, senderNumber, rawText);
    return;
  }

  const { addMemberState, handleAddMemberTextInput } = adminGroup;
  if (addMemberState.has(senderNumber)) {
    const handled = await handleAddMemberTextInput(
      sock,
      msg,
      jid,
      senderNumber,
      rawText,
    );
    if (handled) return;
  }

  if (
    text.startsWith("grpselect_") ||
    text.startsWith("grppromote_") ||
    text.startsWith("grpdemote_") ||
    text.startsWith("grpnotadmin_") ||
    text.startsWith("grpkick_") ||
    text.startsWith("grpkicklist_") ||
    text.startsWith("grpaddmember_") ||
    text === "grpadmin_add_member" ||
    text === "grpadmin_kick_member" ||
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

  if (isDynamicConfirm(text)) {
    const fullServiceId = text.replace("confirm_", "");
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
      // ======================================
      // 🏠 MENU UTAMA
      // ======================================
      case "menu":
      case "/menu":
      case "help":
      case "/help":
      case "menu_back":
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;

      // ======================================
      // 🔍 DEBUG LID (Owner Only)
      // ======================================
      case "debug_lid": {
        if (!isOwner(senderNumber)) break;

        const rawParticipantLid =
          msg.key?.participantLid || msg.key?.participant_lid || "N/A";
        const storeContacts = sock.store?.contacts || {};
        const totalContacts = Object.keys(storeContacts).length;

        const contactsWithLid = Object.entries(storeContacts)
          .filter(([, c]) => c?.lid)
          .slice(0, 10);

        let contactInfo =
          contactsWithLid.length > 0
            ? contactsWithLid
                .map(([id, c]) => `\n• ${id}\n  lid: ${c.lid}`)
                .join("")
            : "\n_tidak ada_";

        let groupInfo = "_bukan group_";
        if (isGroupChat(jid)) {
          try {
            const meta = await sock.groupMetadata(jid);
            const ps = meta.participants.slice(0, 10);
            groupInfo = ps
              .map(
                (p) =>
                  `\n• id: ${p.id}` +
                  (p.lid ? `\n  lid: ${p.lid}` : "") +
                  (p.name ? ` (${p.name})` : ""),
              )
              .join("");
          } catch (e) {
            groupInfo = `Error: ${e.message}`;
          }
        }

        const lidEntries = getLidMapEntries().slice(0, 15);
        const lidInfo =
          lidEntries.length > 0
            ? lidEntries.map(([k, v]) => `\n• ${k} → ${v}`).join("")
            : "\n_kosong_";

        const keyDump = JSON.stringify(msg.key, null, 2).substring(0, 300);

        await sock.sendMessage(jid, {
          text:
            `🔍 *DEBUG LID INFO*\n\n` +
            `*msg.key.participant:*\n${rawParticipant}\n\n` +
            `*msg.key.participantLid:*\n${rawParticipantLid}\n\n` +
            `*msg.key (raw):*\n\`\`\`${keyDump}\`\`\`\n\n` +
            `*LID Map (${getLidMapSize()} entries):*${lidInfo}\n\n` +
            `*Store Contacts (${totalContacts} total, ${contactsWithLid.length} punya LID):*${contactInfo}\n\n` +
            `*Group Participants:*${groupInfo}`,
        });
        break;
      }

      // ======================================
      // 💼 JASA PEMESANAN
      // ======================================
      case "jasa":
      case "/jasa":
      case "website":
      case "/website":
      case "menu_jasa":
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

      // ======================================
      // 📢 ANNOUNCE / BROADCAST — PRIVATE ONLY
      // ======================================
      case "announce":
      case "/announce":
      case "/broadcast":
      case "broadcast": {
        if (!isPrivate) {
          await sock.sendMessage(jid, {
            text:
              `📢 *BROADCAST*\n\n` +
              `⚠️ Fitur ini hanya bisa digunakan di *private chat*.\n\n` +
              `Silakan chat bot secara langsung untuk menggunakan fitur broadcast.`,
          });
          break;
        }
        if (isOwner(senderNumber) || isAdminBot(senderNumber)) {
          await announce.handleAnnounceStart(sock, jid, senderNumber);
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      case "announce_history": {
        if (!isPrivate) {
          await sock.sendMessage(jid, {
            text:
              `📋 *RIWAYAT BROADCAST*\n\n` +
              `⚠️ Fitur ini hanya bisa digunakan di *private chat*.`,
          });
          break;
        }
        if (isOwner(senderNumber) || isAdminBot(senderNumber)) {
          await announce.handleAnnounceHistory(sock, jid, senderNumber);
        } else {
          await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
        }
        break;
      }

      // ======================================
      // 👑 OWNER PANEL
      // ======================================
      case "owner":
      case "/owner":
      case "panel_owner": {
        // ── Section Owner ──
        if (_isOwner) {
          const ownerSection = owner.getOwnerMenuSection();

          // ✅ Tambahkan menu announce HANYA di private chat
          if (isPrivate) {
            ownerSection.rows.push({
              header: "📢",
              title: "Broadcast Group",
              description: "Kirim pesan ke beberapa group",
              id: "announce_start",
            });
            ownerSection.rows.push({
              header: "📋",
              title: "Riwayat Broadcast",
              description: "Lihat history broadcast",
              id: "announce_history",
            });
          }

          sections.push(ownerSection);
        }
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;
      }

      // ======================================
      // 🛡️ ADMIN BOT PANEL
      // ======================================
      case "admin":
      case "/admin":
      case "panel_admin": {
        if (_isAdminBot && !_isOwner) {
          const adminSection = adminBot.getAdminBotMenuSection(senderNumber);

          // ✅ Tambahkan menu announce HANYA di private chat
          if (isPrivate) {
            adminSection.rows.push({
              header: "📢",
              title: "Broadcast Group",
              description: "Kirim pesan ke beberapa group",
              id: "announce_start",
            });
            adminSection.rows.push({
              header: "📋",
              title: "Riwayat Broadcast",
              description: "Lihat history broadcast",
              id: "announce_history",
            });
          }

          sections.push(adminSection);
        }
        await sendMainMenu(sock, msg, jid, sender, senderNumber);
        break;
      }

      case "admin_add":
      case "adminbot_add": {
        if (isOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text:
              `➕ *TAMBAH ADMIN BOT*\n\n` +
              `Ketik:\n\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n` +
              `atau mention:\n\`\`\`/addadmin @username\`\`\``,
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

      // ======================================
      // 🖼️ EDIT BANNER
      // ======================================
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

      // ======================================
      // 👥 GROUP ADMIN MANAGER
      // ======================================
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

      // ======================================
      // 📨 DEMO FITUR
      // ======================================
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

      // ======================================
      // ℹ️ INFORMASI
      // ======================================
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

      // ======================================
      // DEFAULT
      // ======================================
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
// MENU UTAMA
// ==========================================
async function sendMainMenu(sock, msg, jid, sender, senderNumber) {
  const hasTestingService = config.services?.some((s) => s.id === "testing");
  const isPrivate = isPrivateChat(jid);
  const sections = [];

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

  const _isOwner = isOwner(senderNumber);
  const _isAdminBot = isAdminBot(senderNumber);
  let _isGroupAdmin = false;

  if (!_isOwner && !_isAdminBot) {
    _isGroupAdmin = await adminGroup.canAccessGroupManager(sock, senderNumber);
  }

  // ── Section Owner ──
  if (_isOwner) {
    const ownerSection = owner.getOwnerMenuSection();

    // ✅ Tambahkan menu announce hanya di private chat
    if (isPrivate) {
      ownerSection.rows.push({
        header: "📢",
        title: "Broadcast Group",
        description: "Kirim pesan ke beberapa group",
        id: "announce_start",
      });
      ownerSection.rows.push({
        header: "📋",
        title: "Riwayat Broadcast",
        description: "Lihat history broadcast",
        id: "announce_history",
      });
    }

    sections.push(ownerSection);
  }

  // ── Section Admin Bot ──
  if (_isAdminBot && !_isOwner) {
    const adminSection = adminBot.getAdminBotMenuSection(senderNumber);

    // ✅ Tambahkan menu announce hanya di private chat
    if (isPrivate) {
      adminSection.rows.push({
        header: "📢",
        title: "Broadcast Group",
        description: "Kirim pesan ke beberapa group",
        id: "announce_start",
      });
      adminSection.rows.push({
        header: "📋",
        title: "Riwayat Broadcast",
        description: "Lihat history broadcast",
        id: "announce_history",
      });
    }

    sections.push(adminSection);
  }

  if (_isGroupAdmin && !_isOwner && !_isAdminBot) {
    sections.push(adminGroup.getAdminGroupMenuSection());
  }

  const roleText = _isOwner
    ? "👑 Owner"
    : _isAdminBot
      ? "🛡️ Admin Bot"
      : _isGroupAdmin
        ? "👥 Admin Group"
        : "👤 User";

  console.log(
    `🔐 sendMainMenu: senderNumber="${senderNumber}" ` +
      `isOwner=${_isOwner} isAdminBot=${_isAdminBot} ` +
      `isGroupAdmin=${_isGroupAdmin} → role="${roleText}"`,
  );

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
      console.log(`🖼️ Menu + banner → ${senderNumber} [${roleText}]`);
      return;
    } catch (err) {
      console.error(`⚠️ Banner gagal, fallback text: ${err.message}`);
    }
  }

  await sock.sendMessage(jid, {
    text: caption,
    ...interactivePayload,
  });
  console.log(`📋 Menu text → ${senderNumber} [${roleText}]`);
}

// ==========================================
// DEMO: BUTTON, LIST, TEMPLATE, IMAGE
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
        quickReplyButton: { displayText: "🔄 Quick Reply", id: "btn_info" },
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

module.exports = { handleMessage };
