// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel + Edit Banner + Group Admin Manager
//  ✅ Fixed: LID-based bot detection
//  ✅ Fixed: Promote/Demote hasil pakai @mention + nama
//  Bot LID: 127569823277085
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
// ✅ BOT LID REGISTRY
// ==========================================
const BOT_LID_LIST = [
  "127569823277085", // LID utama (dari screenshot)
];

// Runtime cache
let runtimeBotPhone = null;
let runtimeBotLid = null;

// ==========================================
// ADMIN DATABASE
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
// BASIC HELPERS
// ==========================================
function normalizeNumber(num) {
  return String(num).replace(/[^0-9]/g, "");
}

function jidToDigits(jid) {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

function cleanNumber(jid) {
  return jidToDigits(jid);
}

function getNumberFromJid(jid) {
  return jidToDigits(jid);
}

// ✅ Normalisasi JID ke format @s.whatsapp.net
// Digunakan untuk mention yang benar
function toPhoneJid(jid) {
  if (!jid) return "";
  const digits = jidToDigits(jid);
  if (!digits) return jid;
  return `${digits}@s.whatsapp.net`;
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
// ✅ SET RUNTIME BOT INFO
// ==========================================
function setBotRuntimeInfo(sock) {
  const userId = sock.user?.id || "";
  const userLid = sock.user?.lid || "";

  if (userId) {
    runtimeBotPhone = jidToDigits(userId);
    console.log(`💾 Bot phone cached: "${runtimeBotPhone}"`);
  }

  if (userLid) {
    runtimeBotLid = jidToDigits(userLid);
    if (!BOT_LID_LIST.includes(runtimeBotLid)) {
      BOT_LID_LIST.push(runtimeBotLid);
      console.log(`💾 Bot LID added: "${runtimeBotLid}"`);
    } else {
      console.log(`💾 Bot LID confirmed: "${runtimeBotLid}"`);
    }
  }

  console.log(`📋 BOT_LID_LIST: [${BOT_LID_LIST.join(", ")}]`);
}

// ==========================================
// ✅ IS PARTICIPANT BOT?
// ==========================================
function isParticipantBot(participantJid) {
  if (!participantJid) return false;

  const pDigits = jidToDigits(participantJid);
  const pDomain = (participantJid.split("@")[1] || "").toLowerCase();

  // Check LID registry
  if (pDomain === "lid") {
    for (const lid of BOT_LID_LIST) {
      if (pDigits === lid) return true;
    }
  }

  // Check phone
  if (pDomain !== "lid" && runtimeBotPhone && pDigits === runtimeBotPhone) {
    return true;
  }

  // Suffix match
  if (
    pDomain !== "lid" &&
    runtimeBotPhone &&
    pDigits.length >= 8 &&
    runtimeBotPhone.length >= 8 &&
    pDigits.slice(-8) === runtimeBotPhone.slice(-8)
  ) {
    return true;
  }

  return false;
}

// ==========================================
// ✅ FIND BOT IN PARTICIPANTS
// ==========================================
function findBotInParticipants(participants) {
  if (!participants || participants.length === 0) return null;

  console.log(`\n🔍 findBotInParticipants (${participants.length} total):`);
  console.log(`   BOT_LID_LIST: [${BOT_LID_LIST.join(", ")}]`);
  console.log(`   runtimeBotPhone: "${runtimeBotPhone || "not set"}"`);

  for (const p of participants) {
    const pDigits = jidToDigits(p.id);
    const pDomain = (p.id.split("@")[1] || "").toLowerCase();
    const isBot = isParticipantBot(p.id);

    console.log(
      `   [${isBot ? "✅BOT" : "   "}] "${p.id}" | domain: ${pDomain} | digits: "${pDigits}" | admin: ${p.admin || "none"}`,
    );

    if (isBot) return p;
  }

  console.log(`   ❌ Bot not found`);
  return null;
}

// ==========================================
// ✅ CEK BOT ADMIN DI GROUP
// ==========================================
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    console.log(`\n🔍 isBotAdmin - "${meta.subject}"`);

    let botP = findBotInParticipants(meta.participants);

    if (!botP) {
      console.log(`   ⚠️ Trying cache fallback...`);
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const cached = allGroups[groupJid];
        if (cached?.participants) {
          botP = findBotInParticipants(cached.participants);
          if (botP) console.log(`   ✅ Found in cache: "${botP.id}"`);
        }
      } catch (e) {
        console.error(`   Cache fallback error: ${e.message}`);
      }
    }

    if (!botP) {
      console.log(`   ❌ Bot not found → NOT admin`);
      return false;
    }

    const isAdm = botP.admin === "admin" || botP.admin === "superadmin";
    console.log(
      `   ✅ Bot: "${botP.id}" | admin: ${isAdm} (${botP.admin || "none"})`,
    );
    return isAdm;
  } catch (err) {
    console.error(`❌ isBotAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ GET JOINED GROUPS
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    console.log(`\n📋 getJoinedGroups: ${groupList.length} groups`);

    const result = [];

    for (const g of groupList) {
      let participants = g.participants || [];
      let groupName = g.subject || "Unknown Group";
      let botIsAdmin = false;

      try {
        const freshMeta = await sock.groupMetadata(g.id);
        participants = freshMeta.participants || [];
        groupName = freshMeta.subject || groupName;
      } catch (e) {
        console.warn(`   ⚠️ Fresh meta failed "${groupName}": ${e.message}`);
      }

      const botP = findBotInParticipants(participants);
      if (botP) {
        botIsAdmin = botP.admin === "admin" || botP.admin === "superadmin";
        console.log(
          `   ✅ "${groupName}" → bot: "${botP.id}" | admin: ${botIsAdmin}`,
        );
      } else {
        console.log(`   ❌ "${groupName}" → bot not found`);
      }

      result.push({ jid: g.id, name: groupName, participants, botIsAdmin });
    }

    const adminCount = result.filter((g) => g.botIsAdmin).length;
    console.log(`   📊 ${result.length} groups, ${adminCount} as admin\n`);

    return result;
  } catch (err) {
    console.error(`❌ getJoinedGroups error: ${err.message}`);
    return [];
  }
}

// ==========================================
// ✅ HELPER: AMBIL NAMA DARI METADATA GROUP
// ==========================================
function getParticipantName(meta, jid) {
  // Coba ambil dari notify name di participant
  const p = (meta?.participants || []).find(
    (x) => jidToDigits(x.id) === jidToDigits(jid),
  );
  if (p?.notify) return p.notify;
  if (p?.name) return p.name;
  // Fallback: nomor saja
  return `+${jidToDigits(jid)}`;
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
    target = jidToDigits(mentions[0]);
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
// HANDLER: DEL ADMIN BOT (command)
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
// HANDLER: DEL ADMIN BOT (dari list)
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
// EXECUTE DELETE ADMIN
// ==========================================
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
// KIRIM LIST DELETE ADMIN
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

  setTimeout(
    () => {
      const state = bannerEditState.get(senderNumber);
      if (state?.waiting) {
        bannerEditState.delete(senderNumber);
        sock
          .sendMessage(jid, {
            text: `⏰ *Mode edit banner habis waktu.*\n\nKetik *edit_banner* untuk mencoba lagi.`,
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

    if (!buffer || buffer.length === 0)
      throw new Error("Buffer gambar kosong, coba kirim ulang.");
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error(
        `Ukuran terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 5 MB)`,
      );

    fs.writeFileSync(BANNER_PATH, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`✅ Banner disimpan: ${sizeKB} KB oleh ${senderNumber}`);

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
// 👥 GROUP MANAGER — MENU UTAMA
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data group...*` });

  const joinedGroups = await getJoinedGroups(sock);
  const adminCount = joinedGroups.filter((g) => g.botIsAdmin).length;
  const nonAdminCount = joinedGroups.filter((g) => !g.botIsAdmin).length;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status Bot di Group:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot admin: ${adminCount} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminCount} group\n\n` +
      `🤖 *Bot LID:* ${BOT_LID_LIST.join(", ")}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Cara penggunaan:*\n` +
      `├ ⬆️ *Promote* → jadikan member jadi admin\n` +
      `├ ⬇️ *Demote* → turunkan admin jadi member\n` +
      `└ 👁️ *Lihat Admin* → cek daftar admin group\n\n` +
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
// 👥 PILIH GROUP
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
      text: `❌ *Tidak ada group ditemukan.*\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const adminGroupRows = [];
  const nonAdminGroupRows = [];

  for (const g of joinedGroups) {
    const adminCount = g.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    ).length;
    const memberCount = g.participants.length;
    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;

    if (g.botIsAdmin) {
      adminGroupRows.push({
        header: `✅ ${memberCount} anggota · ${adminCount} admin`,
        title: shortName,
        description: `Bot admin`,
        id: `grpselect_${action}_${g.jid}`,
      });
    } else {
      nonAdminGroupRows.push({
        header: `⚠️ ${memberCount} anggota · Bot bukan admin`,
        title: shortName,
        description:
          action === "view" ? `Lihat saja` : `⚠️ Promote bot jadi admin dulu`,
        id:
          action === "view"
            ? `grpselect_view_${g.jid}`
            : `grpnotadmin_${g.jid}`,
      });
    }
  }

  const sections = [];
  if (adminGroupRows.length > 0) {
    for (let i = 0; i < adminGroupRows.length; i += 10) {
      sections.push({
        title: `✅ Bot Sudah Admin (${adminGroupRows.length})`,
        rows: adminGroupRows.slice(i, i + 10),
      });
    }
  }
  if (nonAdminGroupRows.length > 0) {
    for (let i = 0; i < nonAdminGroupRows.length; i += 10) {
      sections.push({
        title: `⚠️ Bot Bukan Admin (${nonAdminGroupRows.length})`,
        rows: nonAdminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (sections.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak ada group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Bot bergabung di *${joinedGroups.length}* group:\n` +
      `├ ✅ Bot admin: *${adminGroupRows.length}*\n` +
      `└ ⚠️ Bot bukan admin: *${nonAdminGroupRows.length}*\n\n` +
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
// PERINGATAN BOT BUKAN ADMIN
// ==========================================
async function handleBotNotAdmin(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  let groupName = groupJid;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupName = meta?.subject || groupJid;
  } catch (e) {}

  await sock.sendMessage(jid, {
    text:
      `⚠️ *BOT BUKAN ADMIN GROUP*\n\n` +
      `👥 *Group:* ${groupName}\n\n` +
      `❌ Bot tidak bisa promote/demote karena bukan admin.\n\n` +
      `✅ *Cara jadikan bot admin:*\n` +
      `1️⃣ Buka group *${groupName}*\n` +
      `2️⃣ Info Group → Tap kontak bot\n` +
      `3️⃣ Pilih *Jadikan Admin*\n\n` +
      `Setelah itu ketik *group_manager* lagi.`,
  });
}

// ==========================================
// PROMOTE: PILIH MEMBER
// ==========================================
async function handleGroupSelectedForPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data member...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const members = meta.participants.filter((p) => {
    if (p.admin === "admin" || p.admin === "superadmin") return false;
    if (isParticipantBot(p.id)) return false;
    return true;
  });

  const adminCount = meta.participants.filter(
    (p) => p.admin === "admin" || p.admin === "superadmin",
  ).length;

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada member untuk di-promote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Semua anggota sudah admin.`,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < members.length; i += 10) {
    const chunk = members.slice(i, i + 10);
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + 10, members.length)})`,
      rows: chunk.map((p) => {
        const number = jidToDigits(p.id);
        const displayName = p.notify || p.name || `+${number}`;
        return {
          header: `⬆️ Promote ke Admin`,
          title: displayName,
          description: `+${number}`,
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
      `💬 Atau command di group:\n\`\`\`/promote @user\`\`\`\n\n` +
      `Pilih member 👇`,
    footer: `✅ Bot sudah admin`,
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
// DEMOTE: PILIH ADMIN
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const admins = meta.participants.filter((p) => {
    if (p.admin !== "admin") return false;
    if (isParticipantBot(p.id)) return false;
    return true;
  });

  const superAdmins = meta.participants.filter(
    (p) => p.admin === "superadmin",
  );

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner (tidak bisa di-demote):*\n` +
          superAdmins.map((p) => `└ +${jidToDigits(p.id)}`).join("\n")
        : "";
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada admin yang bisa di-demote.*\n\n` +
        `👥 Group: *${groupName}*` +
        superList,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < admins.length; i += 10) {
    const chunk = admins.slice(i, i + 10);
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + 10, admins.length)})`,
      rows: chunk.map((p) => {
        const number = jidToDigits(p.id);
        const displayName = p.notify || p.name || `+${number}`;
        return {
          header: `⬇️ Demote ke Member`,
          title: displayName,
          description: `+${number}`,
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
      `💬 Atau command di group:\n\`\`\`/demote @user\`\`\`\n\n` +
      `Pilih admin 👇`,
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
// VIEW: INFO ADMIN GROUP
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;
  const totalMembers = meta.participants.length;
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  const botP = findBotInParticipants(meta.participants);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *INFO ADMIN GROUP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n`;

  if (botP) {
    text += `🔑 *Bot JID:* ${botP.id}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const number = jidToDigits(p.id);
      const name = p.notify || p.name || `+${number}`;
      const isBot = isParticipantBot(p.id);
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} ${name}${isBot ? " 🤖" : ""} (+${number})\n`;
    });
  }

  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const number = jidToDigits(p.id);
      const name = p.notify || p.name || `+${number}`;
      const isBot = isParticipantBot(p.id);
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} ${name}${isBot ? " 🤖" : ""} (+${number})\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// EXECUTE PROMOTE (dari list button)
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = jidToDigits(targetJid);
  // Normalisasi ke phone JID untuk API
  const targetPhoneJid = toPhoneJid(targetJid);

  await sock.sendMessage(jid, {
    text: `⏳ *Mempromote anggota...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetPhoneJid], "promote");
    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || groupJid;

    // Ambil nama dari metadata terbaru
    const updatedP = (meta?.participants || []).find(
      (p) => jidToDigits(p.id) === targetNumber,
    );
    const displayName =
      updatedP?.notify || updatedP?.name || `+${targetNumber}`;

    console.log(`⬆️ Promote OK: ${displayName} (+${targetNumber}) @ ${groupName}`);

    await sock.sendMessage(
      jid,
      {
        text:
          `⬆️ *PROMOTE BERHASIL!*\n\n` +
          `👥 *Group:* ${groupName}\n` +
          `👤 *Member:* @${targetNumber}\n` +
          `🏷️ *Nama:* ${displayName}\n` +
          `🔄 *Status:* Member → 🛡️ Admin\n` +
          `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}`,
        mentions: [targetPhoneJid],
      },
    );
  } catch (err) {
    console.error(`❌ Promote failed: ${err.message}`);
    let errMsg = err.message;
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "User bukan anggota group.";
    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL PROMOTE*\n\n` +
        `👤 Target: @${targetNumber}\n` +
        `📛 Error: ${errMsg}`,
      mentions: [targetPhoneJid],
    });
  }
}

// ==========================================
// EXECUTE DEMOTE (dari list button)
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = jidToDigits(targetJid);
  const targetPhoneJid = toPhoneJid(targetJid);

  await sock.sendMessage(jid, {
    text: `⏳ *Mendemote admin...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetPhoneJid], "demote");
    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || groupJid;

    const updatedP = (meta?.participants || []).find(
      (p) => jidToDigits(p.id) === targetNumber,
    );
    const displayName =
      updatedP?.notify || updatedP?.name || `+${targetNumber}`;

    console.log(`⬇️ Demote OK: ${displayName} (+${targetNumber}) @ ${groupName}`);

    await sock.sendMessage(
      jid,
      {
        text:
          `⬇️ *DEMOTE BERHASIL!*\n\n` +
          `👥 *Group:* ${groupName}\n` +
          `👤 *Admin:* @${targetNumber}\n` +
          `🏷️ *Nama:* ${displayName}\n` +
          `🔄 *Status:* 🛡️ Admin → Member\n` +
          `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}`,
        mentions: [targetPhoneJid],
      },
    );
  } catch (err) {
    console.error(`❌ Demote failed: ${err.message}`);
    let errMsg = err.message;
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "Bukan anggota group.";
    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL DEMOTE*\n\n` +
        `👤 Target: @${targetNumber}\n` +
        `📛 Error: ${errMsg}`,
      mentions: [targetPhoneJid],
    });
  }
}

// ==========================================
// ✅ COMMAND /promote @user (di group)
// Pakai mention agar nama tampil, bukan nomor acak
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
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
      text: `⚠️ *Bot bukan admin group ini.*\n\nJadikan bot admin terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/promote @user\``,
    });
    return;
  }

  // Ambil metadata group untuk nama
  const meta = await sock.groupMetadata(jid).catch(() => null);

  const results = [];
  const mentionJids = [];

  for (const targetJid of mentions) {
    const targetPhoneJid = toPhoneJid(targetJid);
    const number = jidToDigits(targetJid);

    // Ambil nama dari metadata group
    const p = (meta?.participants || []).find(
      (x) => jidToDigits(x.id) === number,
    );
    const displayName = p?.notify || p?.name || `+${number}`;

    mentionJids.push(targetPhoneJid);

    try {
      await sock.groupParticipantsUpdate(jid, [targetPhoneJid], "promote");
      results.push(`✅ @${number} (${displayName}) → 🛡️ Admin`);
      console.log(`⬆️ Promote (cmd): ${displayName} (+${number}) oleh ${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬆️ *HASIL PROMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: mentionJids,
    },
    { quoted: msg },
  );
}

// ==========================================
// ✅ COMMAND /demote @user (di group)
// Pakai mention agar nama tampil, bukan nomor acak
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
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
      text: `⚠️ *Bot bukan admin group ini.*\n\nJadikan bot admin terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/demote @user\``,
    });
    return;
  }

  // Ambil metadata group untuk nama
  const meta = await sock.groupMetadata(jid).catch(() => null);

  const results = [];
  const mentionJids = [];

  for (const targetJid of mentions) {
    const targetPhoneJid = toPhoneJid(targetJid);
    const number = jidToDigits(targetJid);

    const p = (meta?.participants || []).find(
      (x) => jidToDigits(x.id) === number,
    );
    const displayName = p?.notify || p?.name || `+${number}`;

    mentionJids.push(targetPhoneJid);

    try {
      await sock.groupParticipantsUpdate(jid, [targetPhoneJid], "demote");
      results.push(`✅ @${number} (${displayName}) → 👤 Member`);
      console.log(`⬇️ Demote (cmd): ${displayName} (+${number}) oleh ${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬇️ *HASIL DEMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: mentionJids,
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
    const idx = withoutPrefix.indexOf("_");
    if (idx === -1) return;
    const action = withoutPrefix.substring(0, idx);
    const groupJid = withoutPrefix.substring(idx + 1);

    if (action === "promote")
      await handleGroupSelectedForPromote(sock, jid, senderNumber, groupJid);
    else if (action === "demote")
      await handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid);
    else if (action === "view")
      await handleGroupViewAdmins(sock, jid, senderNumber, groupJid);
    return;
  }

  if (rawId.startsWith("grppromote_")) {
    const without = rawId.replace("grppromote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  if (rawId.startsWith("grpdemote_")) {
    const without = rawId.replace("grpdemote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
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
  jidToDigits,
  setBotRuntimeInfo,
  isParticipantBot,
  findBotInParticipants,
  BOT_LID_LIST,
};