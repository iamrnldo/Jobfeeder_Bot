// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel + Edit Banner + Group Admin Manager
//  ✅ Fixed: Support LID format WhatsApp baru
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

// ==========================================
// PATHS
// ==========================================
const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");
const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");
const BANNER_DIR = path.join(__dirname, "images", "menu");

// ==========================================
// STATE MAPS
// ==========================================
const bannerEditState = new Map();

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
// HELPERS UMUM
// ==========================================
function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

// Ekstrak nomor/id bersih dari JID
// "628xxx:12@s.whatsapp.net" → "628xxx"
// "628xxx@s.whatsapp.net"   → "628xxx"
// "127569823277085:0@lid"   → "127569823277085"
// "628xxx@lid"              → "628xxx"
function cleanNumber(jid) {
  if (!jid) return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

function getNumberFromJid(jid) {
  return cleanNumber(jid);
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

function ensureBannerDir() {
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
  }
}

// ==========================================
// ✅ BOT IDENTITY — Support LID + Phone Number
//
// WhatsApp sekarang menggunakan 2 format JID:
//   1. Phone: "628xxx@s.whatsapp.net"
//   2. LID:   "127569823277085:0@lid"
//
// sock.user.id  → bisa phone ATAU LID
// sock.user.lid → LID (jika tersedia)
// sock.user.phone → nomor telepon (jika tersedia)
//
// Di participant list group, bot bisa muncul
// dalam format APAPUN (phone atau LID)
// ==========================================

// Ambil semua identifier bot dari sock
function getBotIdentifiers(sock) {
  const result = {
    number: "", // nomor telepon bersih
    phoneJid: "", // JID format phone
    lid: "", // LID bersih (tanpa @lid)
    lidFull: "", // LID lengkap
    userId: "", // sock.user.id bersih
  };

  const userId = sock.user?.id || "";
  const userLid = sock.user?.lid || "";

  // Parse sock.user.id
  if (userId) {
    result.userId = userId;
    const cleanId = userId.split("@")[0].split(":")[0];

    // Cek apakah LID atau phone
    // LID biasanya panjang (>12 digit) dan tidak diawali 62/1/+
    // Phone biasanya dimulai kode negara
    result.phoneJid = cleanId + "@s.whatsapp.net";
    result.number = cleanId.replace(/[^0-9]/g, "");
  }

  // Parse sock.user.lid (LID format)
  if (userLid) {
    result.lidFull = userLid;
    result.lid = userLid
      .split("@")[0]
      .split(":")[0]
      .replace(/[^0-9]/g, "");
  }

  // Jika sock.user.id sendiri adalah LID format
  // Deteksi: @lid domain
  if (userId.includes("@lid")) {
    result.lid = userId
      .split("@")[0]
      .split(":")[0]
      .replace(/[^0-9]/g, "");
    result.lidFull = userId;
  }

  console.log(`🤖 Bot identifiers:`, JSON.stringify(result));
  return result;
}

// Ambil nomor bersih bot
function getBotNumber(sock) {
  return getBotIdentifiers(sock).number;
}

// ==========================================
// ✅ CORE FIX: isParticipantBot
//
// Cek apakah participant JID adalah bot,
// support SEMUA format JID:
//   - "628xxx@s.whatsapp.net"    (phone)
//   - "628xxx:12@s.whatsapp.net" (phone+device)
//   - "127569823277085:0@lid"    (LID)
//   - "127569823277085@lid"      (LID tanpa device)
//
// Strategi matching (prioritas):
//   1. Match LID digit vs LID digit bot
//   2. Match phone digit vs phone digit bot
//   3. Match last 9 digit (toleran kode negara)
// ==========================================
function isParticipantBot(participantJid, botIdentifiers) {
  if (!participantJid) return false;

  const pRaw = participantJid.split("@")[0]; // "628xxx:12" atau "127569823277085:0"
  const pBase = pRaw.split(":")[0]; // "628xxx" atau "127569823277085"
  const pDigits = pBase.replace(/[^0-9]/g, ""); // digit saja
  const pDomain = participantJid.split("@")[1] || ""; // "s.whatsapp.net" atau "lid"

  const isLid = pDomain === "lid";

  // ── MATCH 1: LID vs LID ──────────────────
  if (isLid && botIdentifiers.lid && pDigits === botIdentifiers.lid) {
    console.log(`   ✅ LID match: "${pDigits}" === "${botIdentifiers.lid}"`);
    return true;
  }

  // ── MATCH 2: Phone vs Phone (exact) ──────
  if (!isLid && botIdentifiers.number && pDigits === botIdentifiers.number) {
    console.log(
      `   ✅ Phone match: "${pDigits}" === "${botIdentifiers.number}"`,
    );
    return true;
  }

  // ── MATCH 3: Cross-match LID vs userId ───
  // Kadang sock.user.id adalah LID, participant adalah phone
  // atau sebaliknya — coba digit userId
  const userIdDigits = botIdentifiers.userId
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");

  if (pDigits === userIdDigits) {
    console.log(`   ✅ userId match: "${pDigits}" === "${userIdDigits}"`);
    return true;
  }

  // ── MATCH 4: Last 9 digit (fallback) ─────
  // Toleran perbedaan kode negara
  if (
    pDigits.length >= 9 &&
    botIdentifiers.number.length >= 9 &&
    pDigits.slice(-9) === botIdentifiers.number.slice(-9)
  ) {
    console.log(
      `   ✅ Last9 match: "${pDigits.slice(-9)}" === "${botIdentifiers.number.slice(-9)}"`,
    );
    return true;
  }

  // ── MATCH 5: Last 9 vs LID ────────────────
  if (
    pDigits.length >= 9 &&
    botIdentifiers.lid.length >= 9 &&
    pDigits.slice(-9) === botIdentifiers.lid.slice(-9)
  ) {
    console.log(
      `   ✅ Last9-LID match: "${pDigits.slice(-9)}" === "${botIdentifiers.lid.slice(-9)}"`,
    );
    return true;
  }

  return false;
}

// ==========================================
// HELPERS: GROUP
// ==========================================

// Cek apakah bot adalah admin di group
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const botId = getBotIdentifiers(sock);

    console.log(`\n🔍 isBotAdmin - Group: "${meta.subject}"`);
    console.log(
      `   Bot IDs: number="${botId.number}" lid="${botId.lid}" userId="${botId.userId}"`,
    );

    for (const p of meta.participants) {
      const match = isParticipantBot(p.id, botId);
      const pDigits = p.id
        .split("@")[0]
        .split(":")[0]
        .replace(/[^0-9]/g, "");

      console.log(
        `   [${match ? "✅BOT" : "   "}] "${p.id}" | digits: "${pDigits}" | admin: ${p.admin || "none"}`,
      );

      if (match) {
        const isAdminInGroup = p.admin === "admin" || p.admin === "superadmin";
        console.log(`   → Bot found! isAdmin: ${isAdminInGroup}`);
        return isAdminInGroup;
      }
    }

    // ==========================================
    // ✅ FALLBACK: Jika bot tidak ditemukan di participant list
    // Coba cek via groupFetchAllParticipating (cache)
    // ==========================================
    console.log(`   ⚠️ Bot tidak ditemukan di participant list fresh metadata`);
    console.log(`   ⚠️ Mencoba fallback via groupFetchAllParticipating...`);

    try {
      const allGroups = await sock.groupFetchAllParticipating();
      const groupData = allGroups[groupJid];
      if (groupData) {
        for (const p of groupData.participants || []) {
          const match = isParticipantBot(p.id, botId);
          if (match) {
            const isAdminInGroup =
              p.admin === "admin" || p.admin === "superadmin";
            console.log(
              `   ✅ Found via cache! isAdmin: ${isAdminInGroup} | id: "${p.id}"`,
            );
            return isAdminInGroup;
          }
        }
      }
    } catch (e2) {
      console.error(`   ❌ Fallback gagal: ${e2.message}`);
    }

    console.log(`   ❌ Bot tidak ditemukan di semua sumber data`);
    return false;
  } catch (err) {
    console.error("❌ Gagal cek bot admin:", err.message);
    return false;
  }
}

// Fetch metadata 1 group
async function getGroupMetadata(sock, groupJid) {
  try {
    return await sock.groupMetadata(groupJid);
  } catch (err) {
    console.error(`❌ Gagal fetch metadata group ${groupJid}:`, err.message);
    return null;
  }
}

// ==========================================
// ✅ FIXED: getJoinedGroups
// Support LID format dengan debug lengkap
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    const botId = getBotIdentifiers(sock);

    console.log(`\n🔍 getJoinedGroups - Total: ${groupList.length} group`);
    console.log(
      `   Bot: number="${botId.number}" | lid="${botId.lid}" | userId="${botId.userId}"`,
    );

    const result = [];

    for (const g of groupList) {
      try {
        // Fetch fresh metadata
        const freshMeta = await sock.groupMetadata(g.id);

        let botFound = false;
        let botIsAdmin = false;

        console.log(`\n   📋 Group: "${freshMeta.subject}" (${g.id})`);

        for (const p of freshMeta.participants) {
          const pDigits = p.id
            .split("@")[0]
            .split(":")[0]
            .replace(/[^0-9]/g, "");
          const match = isParticipantBot(p.id, botId);

          if (match) {
            botFound = true;
            botIsAdmin = p.admin === "admin" || p.admin === "superadmin";
            console.log(
              `   ✅ Bot found: "${p.id}" | admin: ${p.admin || "none"}`,
            );
            break;
          }
        }

        if (!botFound) {
          console.log(`   ❌ Bot NOT found in fresh meta`);

          // Debug: print semua participant
          for (const p of freshMeta.participants) {
            const pDigits = p.id
              .split("@")[0]
              .split(":")[0]
              .replace(/[^0-9]/g, "");
            console.log(
              `      participant: "${p.id}" | digits: "${pDigits}" | admin: ${p.admin || "none"}`,
            );
          }

          // Fallback: cek cache
          const cacheParticipants = g.participants || [];
          for (const p of cacheParticipants) {
            if (isParticipantBot(p.id, botId)) {
              botFound = true;
              botIsAdmin = p.admin === "admin" || p.admin === "superadmin";
              console.log(
                `   ✅ Bot found in cache: "${p.id}" | admin: ${p.admin || "none"}`,
              );
              break;
            }
          }
        }

        result.push({
          jid: freshMeta.id,
          name: freshMeta.subject || "Unknown Group",
          participants: freshMeta.participants || [],
          botIsAdmin, // ✅ simpan hasil cek langsung
        });
      } catch (e) {
        console.warn(`⚠️ Error fetch group ${g.id}: ${e.message}`);
        result.push({
          jid: g.id,
          name: g.subject || "Unknown Group",
          participants: g.participants || [],
          botIsAdmin: false,
        });
      }
    }

    return result;
  } catch (err) {
    console.error("❌ Gagal fetch group:", err.message);
    return [];
  }
}

// ==========================================
// HANDLER: ADD ADMIN BOT
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
    target = cleanNumber(mentions[0]);
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
  console.log(`✅ Admin ditambahkan: ${target} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN DITAMBAHKAN*\n\n` +
      `📱 Nomor: ${target}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// HANDLER: DEL ADMIN BOT
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
    await sock.sendMessage(jid, { text: "⛔ Tidak bisa menghapus Owner." });
    return;
  }

  if (!isAdmin(target)) {
    await sock.sendMessage(jid, { text: `❌ *${target}* bukan admin.` });
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
  console.log(`🗑️ Admin dihapus: ${target} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: ${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// KIRIM DAFTAR ADMIN BOT
// ==========================================
async function sendAdminList(sock, jid) {
  const admins = loadAdmins();

  let text =
    `╔══════════════════════╗\n` +
    `║  🔐 *DAFTAR ADMIN*   ║\n` +
    `╚══════════════════════╝\n\n` +
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
// KIRIM LIST DELETE ADMIN BOT
// ==========================================
async function sendAdminDeleteList(sock, jid) {
  const admins = loadAdmins().filter((a) => !isOwner(a));

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `📋 *DELETE ADMIN*\n\n` +
        `_Belum ada admin untuk dihapus._\n\n` +
        `Tambah admin:\n\`\`\`/addadmin 628xxx\`\`\``,
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
          sections: [{ title: "🛡️ Daftar Admin", rows }],
        }),
      },
    ],
  });
}

// ==========================================
// ADMIN: LIST SEMUA ORDER
// ==========================================
async function handleAdminListOrders(sock, jid) {
  const pakasir = require("./pakasir");
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
  const cancelled = all.filter((o) => o.status === "cancelled").length;
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
    `├ 🚫 Dibatalkan: ${cancelled}\n` +
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
// 🖼️ HANDLER: EDIT BANNER
// ==========================================
async function handleEditBanner(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  ensureBannerDir();

  bannerEditState.set(senderNumber, {
    waiting: true,
    jid,
    timestamp: Date.now(),
  });

  const bannerExists = fs.existsSync(BANNER_PATH);
  let bannerInfo = bannerExists
    ? (() => {
        const stat = fs.statSync(BANNER_PATH);
        return (
          `📊 *Banner Saat Ini:*\n` +
          `├ 📁 Ukuran: ${(stat.size / 1024).toFixed(1)} KB\n` +
          `└ 🕐 Diubah: ${new Date(stat.mtime).toLocaleString("id-ID")}\n\n`
        );
      })()
    : `⚠️ _Banner belum ada_\n\n`;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🖼️  *EDIT BANNER MENU*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `${bannerInfo}` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📤 *Kirim gambar baru untuk mengganti banner menu.*\n\n` +
      `📋 *Ketentuan gambar:*\n` +
      `├ Format: JPG / PNG\n` +
      `├ Rasio ideal: 16:9 atau 4:3\n` +
      `├ Resolusi min: 800 x 400 px\n` +
      `└ Ukuran max: 5 MB\n\n` +
      `⏰ _Mode edit aktif selama 5 menit_\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });

  if (bannerExists) {
    try {
      const bannerBuffer = fs.readFileSync(BANNER_PATH);
      await sock.sendMessage(jid, {
        image: bannerBuffer,
        caption: `📌 *Preview Banner Saat Ini*\n\nKirim gambar baru untuk mengganti.`,
      });
    } catch (err) {
      console.error(`⚠️ Gagal kirim preview banner: ${err.message}`);
    }
  }

  // Auto cancel 5 menit
  setTimeout(
    () => {
      const state = bannerEditState.get(senderNumber);
      if (state?.waiting) {
        bannerEditState.delete(senderNumber);
        sock
          .sendMessage(jid, {
            text:
              `⏰ *Mode edit banner habis waktu.*\n\n` +
              `Ketik *edit_banner* untuk mencoba lagi.`,
          })
          .catch(() => {});
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// 🖼️ HANDLER: PROSES GAMBAR MASUK
// ==========================================
async function handleIncomingImage(sock, msg, jid, senderNumber) {
  const state = bannerEditState.get(senderNumber);
  if (!state?.waiting) return;

  const m = msg.message;
  if (!m) return;

  const textContent = (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    ""
  )
    .toLowerCase()
    .trim();

  if (textContent === "batal") {
    bannerEditState.delete(senderNumber);
    await sock.sendMessage(jid, {
      text: `❌ *Edit banner dibatalkan.*\n\nKetik *edit_banner* untuk mencoba lagi.`,
    });
    return;
  }

  const imageMsg = m.imageMessage;
  if (!imageMsg) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Kirim gambar (bukan teks)* untuk mengganti banner.\n\n` +
        `❌ Ketik *batal* untuk membatalkan.`,
    });
    return;
  }

  console.log(`🖼️ Menerima gambar banner dari ${senderNumber}...`);
  bannerEditState.delete(senderNumber);

  await sock.sendMessage(jid, {
    text: `⏳ *Memproses dan menyimpan banner baru...*`,
  });

  try {
    const { downloadMediaMessage } = require("atexovi-baileys");

    ensureBannerDir();

    if (fs.existsSync(BANNER_PATH)) {
      const backupName = `banner_menu_backup_${Date.now()}.jpg`;
      fs.copyFileSync(BANNER_PATH, path.join(BANNER_DIR, backupName));
      console.log(`💾 Banner lama di-backup: ${backupName}`);
    }

    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: {
          info: () => {},
          error: console.error,
          warn: () => {},
          debug: () => {},
          trace: () => {},
          child: () => ({
            info: () => {},
            error: console.error,
            warn: () => {},
            debug: () => {},
            trace: () => {},
          }),
        },
        reuploadRequest: sock.updateMediaMessage,
      },
    );

    if (!buffer || buffer.length === 0) {
      throw new Error("Buffer gambar kosong, coba kirim ulang.");
    }

    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new Error(
        `Ukuran terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 5 MB)`,
      );
    }

    fs.writeFileSync(BANNER_PATH, buffer);

    const sizeKB = (buffer.length / 1024).toFixed(1);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(
      `✅ Banner baru disimpan | ${sizeKB} KB | oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      image: buffer,
      caption:
        `✅ *BANNER BERHASIL DIPERBARUI!*\n\n` +
        `📁 Ukuran: ${sizeKB} KB (${sizeMB} MB)\n` +
        `🕐 Diperbarui: ${new Date().toLocaleString("id-ID")}\n` +
        `👤 Oleh: ${senderNumber}\n\n` +
        `_Banner tampil saat user ketik *menu* / *help*_ ✅`,
    });
  } catch (err) {
    console.error(`❌ Gagal simpan banner: ${err.message}`);

    try {
      const backupFiles = fs
        .readdirSync(BANNER_DIR)
        .filter((f) => f.startsWith("banner_menu_backup_"))
        .sort()
        .reverse();
      if (backupFiles.length > 0) {
        fs.copyFileSync(path.join(BANNER_DIR, backupFiles[0]), BANNER_PATH);
        console.log(`🔄 Banner di-restore: ${backupFiles[0]}`);
      }
    } catch (e) {}

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMPERBARUI BANNER*\n\n` +
        `📛 Error: ${err.message}\n\n` +
        `📋 *Pastikan:*\n` +
        `├ Format JPG atau PNG\n` +
        `├ Ukuran max 5 MB\n` +
        `└ Koneksi stabil\n\n` +
        `🔄 Ketik *edit_banner* untuk mencoba lagi.`,
    });
    return;
  }

  // Bersihkan backup lama (max 3)
  try {
    const backupFiles = fs
      .readdirSync(BANNER_DIR)
      .filter((f) => f.startsWith("banner_menu_backup_"))
      .sort()
      .reverse();
    for (let i = 3; i < backupFiles.length; i++) {
      fs.unlinkSync(path.join(BANNER_DIR, backupFiles[i]));
      console.log(`🗑️ Backup lama dihapus: ${backupFiles[i]}`);
    }
  } catch (e) {}
}

// ==========================================
// 👥 GROUP ADMIN MANAGER
// ==========================================

async function handleGroupManager(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data group...*` });

  const joinedGroups = await getJoinedGroups(sock);

  // ✅ Gunakan botIsAdmin yang sudah dihitung di getJoinedGroups
  const adminGroups = joinedGroups.filter((g) => g.botIsAdmin).length;
  const nonAdminGroups = joinedGroups.filter((g) => !g.botIsAdmin).length;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status Bot di Group:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot sebagai admin: ${adminGroups} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminGroups} group\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Cara penggunaan:*\n` +
      `├ ⬆️ *Promote* → jadikan member jadi admin\n` +
      `├ ⬇️ *Demote* → turunkan admin jadi member\n` +
      `├ 👁️ *Lihat Admin* → cek daftar admin group\n` +
      `└ 💬 Command di group: \`/promote @user\` · \`/demote @user\`\n\n` +
      `⚠️ _Bot harus menjadi admin group untuk promote/demote_\n\n` +
      `Pilih aksi di bawah 👇`,
    footer: `© ${config.botName} | Group Admin Manager`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Aksi",
          sections: [
            {
              title: "⚙️ Aksi Group Admin",
              rows: [
                {
                  header: "⬆️ Promote",
                  title: "Promote Member → Admin",
                  description: "Jadikan member biasa sebagai admin group",
                  id: "grpadmin_promote",
                },
                {
                  header: "⬇️ Demote",
                  title: "Demote Admin → Member",
                  description: "Turunkan admin group menjadi member biasa",
                  id: "grpadmin_demote",
                },
                {
                  header: "👁️ Lihat",
                  title: "Lihat Admin Group",
                  description: "Tampilkan daftar admin di group",
                  id: "grpadmin_view",
                },
              ],
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// STEP 2 — PILIH GROUP
// ✅ Gunakan botIsAdmin dari getJoinedGroups
// ==========================================
async function handleGroupSelectForAction(sock, jid, senderNumber, action) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const actionLabel = {
    promote: "⬆️ Promote Member",
    demote: "⬇️ Demote Admin",
    view: "👁️ Lihat Admin Group",
  };

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  const joinedGroups = await getJoinedGroups(sock);

  if (joinedGroups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Tidak ada group ditemukan.*\n\n` +
        `Pastikan bot sudah bergabung ke group.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
    return;
  }

  const adminGroupRows = [];
  const nonAdminGroupRows = [];

  for (const g of joinedGroups) {
    // ✅ Gunakan botIsAdmin yang sudah ada
    const botIsAdmin = g.botIsAdmin;

    const adminCount = g.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    ).length;
    const memberCount = g.participants.length;
    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;

    if (botIsAdmin) {
      adminGroupRows.push({
        header: `✅ ${memberCount} anggota · ${adminCount} admin`,
        title: shortName,
        description: `Bot admin · ${g.jid}`,
        id: `grpselect_${action}_${g.jid}`,
      });
    } else {
      nonAdminGroupRows.push({
        header: `⚠️ ${memberCount} anggota · Bot bukan admin`,
        title: shortName,
        description:
          action === "view"
            ? `Lihat saja · ${g.jid}`
            : `⚠️ Promote bot jadi admin dulu`,
        id:
          action === "view"
            ? `grpselect_view_${g.jid}`
            : `grpnotadmin_${g.jid}`,
      });
    }
  }

  // Build sections
  const sections = [];

  if (adminGroupRows.length > 0) {
    for (let i = 0; i < adminGroupRows.length; i += 10) {
      sections.push({
        title:
          adminGroupRows.length > 10
            ? `✅ Bot Admin (${i + 1}–${Math.min(i + 10, adminGroupRows.length)})`
            : `✅ Bot Sudah Admin (${adminGroupRows.length})`,
        rows: adminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (nonAdminGroupRows.length > 0) {
    for (let i = 0; i < nonAdminGroupRows.length; i += 10) {
      sections.push({
        title:
          nonAdminGroupRows.length > 10
            ? `⚠️ Bot Bukan Admin (${i + 1}–${Math.min(i + 10, nonAdminGroupRows.length)})`
            : `⚠️ Bot Bukan Admin (${nonAdminGroupRows.length})`,
        rows: nonAdminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (sections.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak ada group tersedia.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Bot bergabung di *${joinedGroups.length}* group:\n` +
      `├ ✅ Bot admin: *${adminGroupRows.length}* group\n` +
      `└ ⚠️ Bot bukan admin: *${nonAdminGroupRows.length}* group\n\n` +
      `_Group ⚠️ perlu promote bot jadi admin dulu_\n\n` +
      `Pilih group 👇`,
    footer: `Pilih group untuk melanjutkan`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Group",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// PERINGATAN: Bot bukan admin group
// ==========================================
async function handleBotNotAdmin(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  let groupName = groupJid;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupName = meta?.subject || groupJid;
  } catch (e) {}

  const botNumber = getBotNumber(sock);

  await sock.sendMessage(jid, {
    text:
      `⚠️ *BOT BUKAN ADMIN GROUP*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `🤖 *Bot:* +${botNumber}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `❌ Bot tidak bisa promote/demote karena *bukan admin* di group ini.\n\n` +
      `✅ *Cara jadikan bot sebagai admin:*\n` +
      `1️⃣ Buka group *${groupName}*\n` +
      `2️⃣ Tap nama group → *Info Group*\n` +
      `3️⃣ Tap kontak bot\n` +
      `4️⃣ Pilih *Jadikan Admin*\n\n` +
      `Setelah bot menjadi admin, ketik *group_manager* lagi.`,
  });
}

// ==========================================
// STEP 3A — PROMOTE
// ==========================================
async function handleGroupSelectedForPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data member group...*` });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botId = getBotIdentifiers(sock);

  // ✅ Cek bot admin via isBotAdminInGroup (dengan fallback)
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Filter member biasa
  const members = meta.participants.filter(
    (p) =>
      p.admin !== "admin" &&
      p.admin !== "superadmin" &&
      !isParticipantBot(p.id, botId),
  );

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada member untuk di-promote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Semua anggota sudah admin.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
    return;
  }

  const adminCount = meta.participants.filter(
    (p) => p.admin === "admin" || p.admin === "superadmin",
  ).length;

  const sections = [];
  for (let i = 0; i < members.length; i += 10) {
    const chunk = members.slice(i, i + 10);
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + 10, members.length)})`,
      rows: chunk.map((p) => {
        const number = cleanNumber(p.id);
        return {
          header: `⬆️ Promote ke Admin`,
          title: `+${number}`,
          description: `Jadikan +${number} admin group`,
          id: `grppromote_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬆️ *PROMOTE MEMBER → ADMIN*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `👤 *Member:* ${members.length} orang\n` +
      `🛡️ *Admin saat ini:* ${adminCount} orang\n\n` +
      `💬 Atau gunakan command di group:\n` +
      `\`\`\`/promote @user\`\`\`\n\n` +
      `Pilih member yang ingin di-promote 👇`,
    footer: `✅ Bot sudah admin di group ini`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👤 Pilih Member",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// STEP 3B — DEMOTE
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data admin group...*` });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botId = getBotIdentifiers(sock);

  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const admins = meta.participants.filter(
    (p) => p.admin === "admin" && !isParticipantBot(p.id, botId),
  );
  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner Group (tidak bisa di-demote):*\n` +
          superAdmins.map((p) => `└ +${cleanNumber(p.id)}`).join("\n")
        : "";
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada admin yang bisa di-demote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Owner group tidak bisa di-demote.` +
        superList +
        `\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < admins.length; i += 10) {
    const chunk = admins.slice(i, i + 10);
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + 10, admins.length)})`,
      rows: chunk.map((p) => {
        const number = cleanNumber(p.id);
        return {
          header: `⬇️ Demote ke Member`,
          title: `+${number}`,
          description: `Turunkan +${number} jadi member biasa`,
          id: `grpdemote_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬇️ *DEMOTE ADMIN → MEMBER*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `🛡️ *Admin:* ${admins.length} orang\n` +
      `👑 *Owner:* ${superAdmins.length} orang _(tidak bisa di-demote)_\n\n` +
      `💬 Atau gunakan command di group:\n` +
      `\`\`\`/demote @user\`\`\`\n\n` +
      `Pilih admin yang ingin di-demote 👇`,
    footer: `⚠️ Owner group tidak bisa di-demote`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "🛡️ Pilih Admin",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// STEP 3C — VIEW ADMIN
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar admin group...*` });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const totalMembers = meta.participants.length;
  const botId = getBotIdentifiers(sock);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  // ✅ Gunakan isBotAdminInGroup dengan fallback
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *INFO ADMIN GROUP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const number = cleanNumber(p.id);
      const isBot = isParticipantBot(p.id, botId);
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const number = cleanNumber(p.id);
      const isBot = isParticipantBot(p.id, botId);
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// EXECUTE: PROMOTE
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = cleanNumber(targetJid);

  await sock.sendMessage(jid, { text: `⏳ *Mempromote +${targetNumber}...*` });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");
    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬆️ Promote: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 *Status:* Member → 🛡️ Admin\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal promote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message?.includes("not-authorized"))
      errMsg = "Bot bukan admin group.";
    if (err.message?.includes("not-participant"))
      errMsg = "User bukan anggota group.";

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL PROMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }
}

// ==========================================
// EXECUTE: DEMOTE
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = cleanNumber(targetJid);

  await sock.sendMessage(jid, { text: `⏳ *Mendemote +${targetNumber}...*` });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");
    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬇️ Demote: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 *Status:* 🛡️ Admin → Member\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal demote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message?.includes("not-authorized"))
      errMsg = "Bot bukan admin group.";
    if (err.message?.includes("not-participant"))
      errMsg = "Bukan anggota group.";

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL DEMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }
}

// ==========================================
// PROMOTE via command /promote @user
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Command ini hanya bisa digunakan di dalam *group*.`,
    });
    return;
  }

  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const botIsAdmin = await isBotAdminInGroup(sock, jid);
  if (!botIsAdmin) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Bot bukan admin group ini.*\n\n` +
        `Jadikan bot sebagai admin group terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/promote @user\`\n` +
        `Contoh: /promote @628xxxxxxxxxx`,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const targetNumber = cleanNumber(targetJid);
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "promote");
      results.push(`✅ +${targetNumber} → 🛡️ Admin`);
      console.log(`⬆️ Promote (cmd): +${targetNumber} oleh ${senderNumber}`);
    } catch (err) {
      let errMsg = "Gagal";
      if (err.message?.includes("not-authorized")) errMsg = "Bot bukan admin";
      if (err.message?.includes("not-participant")) errMsg = "Bukan anggota";
      results.push(`❌ +${targetNumber} → ${errMsg}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬆️ *HASIL PROMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
    },
    { quoted: msg },
  );
}

// ==========================================
// DEMOTE via command /demote @user
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Command ini hanya bisa digunakan di dalam *group*.`,
    });
    return;
  }

  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const botIsAdmin = await isBotAdminInGroup(sock, jid);
  if (!botIsAdmin) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Bot bukan admin group ini.*\n\n` +
        `Jadikan bot sebagai admin group terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/demote @user\`\n` +
        `Contoh: /demote @628xxxxxxxxxx`,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const targetNumber = cleanNumber(targetJid);
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "demote");
      results.push(`✅ +${targetNumber} → 👤 Member`);
      console.log(`⬇️ Demote (cmd): +${targetNumber} oleh ${senderNumber}`);
    } catch (err) {
      let errMsg = "Gagal";
      if (err.message?.includes("not-authorized")) errMsg = "Bot bukan admin";
      if (err.message?.includes("not-participant")) errMsg = "Bukan anggota";
      results.push(`❌ +${targetNumber} → ${errMsg}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬇️ *HASIL DEMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
    },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminOrOwner(senderNumber)) return;

  if (rawId.startsWith("grpnotadmin_")) {
    const groupJid = rawId.replace("grpnotadmin_", "");
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  if (rawId.startsWith("grpselect_")) {
    const withoutPrefix = rawId.replace("grpselect_", "");
    const underscoreIdx = withoutPrefix.indexOf("_");
    if (underscoreIdx === -1) return;

    const action = withoutPrefix.substring(0, underscoreIdx);
    const groupJid = withoutPrefix.substring(underscoreIdx + 1);

    if (action === "promote") {
      await handleGroupSelectedForPromote(sock, jid, senderNumber, groupJid);
    } else if (action === "demote") {
      await handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid);
    } else if (action === "view") {
      await handleGroupViewAdmins(sock, jid, senderNumber, groupJid);
    }
    return;
  }

  if (rawId.startsWith("grppromote_")) {
    const withoutPrefix = rawId.replace("grppromote_", "");
    const sepIdx = withoutPrefix.indexOf("__");
    if (sepIdx === -1) return;

    const groupJid = withoutPrefix.substring(0, sepIdx);
    const targetJid = withoutPrefix.substring(sepIdx + 2);
    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  if (rawId.startsWith("grpdemote_")) {
    const withoutPrefix = rawId.replace("grpdemote_", "");
    const sepIdx = withoutPrefix.indexOf("__");
    if (sepIdx === -1) return;

    const groupJid = withoutPrefix.substring(0, sepIdx);
    const targetJid = withoutPrefix.substring(sepIdx + 2);
    await executeGroupDemote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }
}

// ==========================================
// ADMIN MENU SECTION
// ==========================================
function getAdminMenuSection(senderNumber) {
  const admins = loadAdmins();
  const role = isOwner(senderNumber) ? "👑 Owner" : "🛡️ Admin";
  const bannerExists = fs.existsSync(BANNER_PATH);

  return {
    title: `🔐 Admin Panel [${role}]`,
    highlight_label: "Restricted",
    rows: [
      {
        header: "➕",
        title: "Tambah Admin",
        description: "Tambah admin bot baru",
        id: "admin_add",
      },
      {
        header: "➖",
        title: "Hapus Admin",
        description: `Hapus admin bot (${admins.length} terdaftar)`,
        id: "admin_del",
      },
      {
        header: "📋",
        title: "Daftar Admin",
        description: "Lihat semua admin bot",
        id: "admin_list",
      },
      {
        header: "📦",
        title: "Daftar Pesanan",
        description: "Semua pesanan masuk",
        id: "admin_orders",
      },
      {
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner menu (ada)"
          : "Upload banner menu (belum ada)",
        id: "admin_banner",
      },
      {
        header: "👥",
        title: "Group Admin Manager",
        description: "Promote / Demote admin group",
        id: "admin_group",
      },
    ],
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,
  handleEditBanner,
  handleIncomingImage,
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,
  handlePromoteCommand,
  handleDemoteCommand,
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  normalizeNumber,
  getNumberFromJid,
  cleanNumber,
};
