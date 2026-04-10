// ==========================================
//  HANDLER_ADMIN.JS
//  Khusus: Admin Bot Panel
//  - Tambah/Hapus/Lihat admin bot
//  - Edit banner
//  - Daftar order
//
//  Hak Akses:
//  Owner : semua fitur
//  Admin : lihat daftar, lihat order, edit banner
//          TIDAK bisa tambah/hapus admin
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
// HELPERS
// ==========================================
function normalizeNumber(num) {
  return String(num).replace(/[^0-9]/g, "");
}

function jidToDigits(jid) {
  if (!jid) return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

function cleanNumber(jid) {
  return jidToDigits(jid);
}

function getNumberFromJid(jid) {
  return jidToDigits(jid);
}

// ==========================================
// ROLE CHECKS
// ==========================================
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
// DEBUG LOG HELPER
// ==========================================
function logAccess(fn, senderNumber, result) {
  console.log(
    `🔐 [${fn}] sender="${senderNumber}" ` +
      `isOwner=${isOwner(senderNumber)} ` +
      `isAdmin=${isAdmin(senderNumber)} ` +
      `→ ${result ? "GRANTED" : "DENIED"}`,
  );
}

// ==========================================
// HANDLER: TAMBAH ADMIN BOT
// Hanya Owner
// ==========================================
async function handleAddAdmin(sock, msg, jid, senderNumber, rawText) {
  logAccess("handleAddAdmin", senderNumber, isOwner(senderNumber));

  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text:
        `⛔ *AKSES DITOLAK*\n\n` +
        `Hanya *Owner* yang bisa menambah admin bot.\n\n` +
        `Role kamu: ${isAdmin(senderNumber) ? "🛡️ Admin" : "👤 User"}`,
    });
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
    await sock.sendMessage(jid, {
      text: "👑 Nomor tersebut adalah Owner.",
    });
    return;
  }

  if (isAdmin(target)) {
    await sock.sendMessage(jid, {
      text: `⚠️ *+${target}* sudah menjadi admin.`,
    });
    return;
  }

  const admins = loadAdmins();
  admins.push(target);
  saveAdmins(admins);
  console.log(`✅ Admin ditambahkan: +${target} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN DITAMBAHKAN*\n\n` +
      `📱 Nomor: +${target}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// HANDLER: HAPUS ADMIN BOT (command)
// Hanya Owner
// ==========================================
async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  logAccess("handleDelAdmin", senderNumber, isOwner(senderNumber));

  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text:
        `⛔ *AKSES DITOLAK*\n\n` +
        `Hanya *Owner* yang bisa menghapus admin bot.\n\n` +
        `Role kamu: ${isAdmin(senderNumber) ? "🛡️ Admin" : "👤 User"}`,
    });
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
// HANDLER: HAPUS ADMIN BOT (dari list)
// Hanya Owner
// ==========================================
async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  logAccess("handleDelAdminFromList", senderNumber, isOwner(senderNumber));

  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: `⛔ *AKSES DITOLAK*\n\nHanya *Owner* yang bisa menghapus admin bot.`,
    });
    return;
  }

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
    await sock.sendMessage(jid, {
      text: "⛔ Tidak bisa menghapus Owner.",
    });
    return;
  }
  if (!isAdmin(target)) {
    await sock.sendMessage(jid, {
      text: `❌ *+${target}* bukan admin.`,
    });
    return;
  }
  if (normalizeNumber(senderNumber) === normalizeNumber(target)) {
    await sock.sendMessage(jid, {
      text: "❌ Tidak bisa menghapus diri sendiri.",
    });
    return;
  }

  const admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);
  console.log(`🗑️ Admin dihapus: +${target} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// KIRIM DAFTAR ADMIN BOT
// Owner + Admin bisa lihat
// ==========================================
async function sendAdminList(sock, jid, senderNumber) {
  logAccess("sendAdminList", senderNumber, isAdminOrOwner(senderNumber));

  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const admins = loadAdmins();

  let text =
    `╔══════════════════════╗\n` +
    `║  🔐 *DAFTAR ADMIN*   ║\n` +
    `╚══════════════════════╝\n\n` +
    `👑 *OWNER:*\n` +
    `└ 📱 +${config.ownerNumber}\n\n` +
    `🛡️ *ADMIN BOT (${admins.length}):*\n`;

  if (admins.length === 0) {
    text += `└ _Belum ada admin_\n`;
  } else {
    admins.forEach((a, i) => {
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${a}\n`;
    });
  }

  text += `\n📊 Total: ${admins.length + 1} (termasuk owner)`;
  await sock.sendMessage(jid, { text });
}

// ==========================================
// KIRIM LIST DELETE ADMIN (untuk Owner)
// ==========================================
async function sendAdminDeleteList(sock, jid, senderNumber) {
  logAccess("sendAdminDeleteList", senderNumber, isOwner(senderNumber));

  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: `⛔ *AKSES DITOLAK*\n\nHanya *Owner* yang bisa menghapus admin.`,
    });
    return;
  }

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
    title: `+${a}`,
    description: `Hapus +${a} dari daftar admin`,
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
// DAFTAR ORDER
// Owner + Admin bisa lihat
// ==========================================
async function handleAdminListOrders(sock, jid, senderNumber) {
  logAccess(
    "handleAdminListOrders",
    senderNumber,
    isAdminOrOwner(senderNumber),
  );

  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

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
      `   👤 ${o.buyerName} (+${o.buyerNumber})\n` +
      `   ${pakasir.statusEmoji(o.status)} ${pakasir.statusLabel(o.status)}\n` +
      `   📅 ${pakasir.formatDate(o.createdAt)}\n\n`;
  });

  text += `_Menampilkan ${orders.length} order terakhir_`;
  await sock.sendMessage(jid, { text });
}

// ==========================================
// EDIT BANNER
// Owner + Admin bisa edit
// ==========================================
async function handleEditBanner(sock, jid, senderNumber) {
  logAccess("handleEditBanner", senderNumber, isAdminOrOwner(senderNumber));

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
  const bannerInfo = bannerExists
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
      `📋 *Ketentuan:*\n` +
      `├ Format: JPG / PNG\n` +
      `├ Rasio ideal: 16:9 atau 4:3\n` +
      `├ Resolusi min: 800 x 400 px\n` +
      `└ Ukuran max: 5 MB\n\n` +
      `⏰ _Mode edit aktif 5 menit_\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });

  if (bannerExists) {
    try {
      await sock.sendMessage(jid, {
        image: fs.readFileSync(BANNER_PATH),
        caption: `📌 *Preview Banner Saat Ini*`,
      });
    } catch (e) {
      console.error(`⚠️ Preview banner gagal: ${e.message}`);
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
// PROSES GAMBAR MASUK (untuk banner)
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
      text: `❌ *Edit banner dibatalkan.*`,
    });
    return;
  }

  const imageMsg = m.imageMessage;
  if (!imageMsg) {
    await sock.sendMessage(jid, {
      text: `⚠️ *Kirim gambar (bukan teks).*\n\nKetik *batal* untuk membatalkan.`,
    });
    return;
  }

  console.log(`🖼️ Gambar banner dari ${senderNumber}...`);
  bannerEditState.delete(senderNumber);

  await sock.sendMessage(jid, { text: `⏳ *Menyimpan banner baru...*` });

  try {
    const { downloadMediaMessage } = require("atexovi-baileys");
    ensureBannerDir();

    if (fs.existsSync(BANNER_PATH)) {
      const backupName = `banner_menu_backup_${Date.now()}.jpg`;
      fs.copyFileSync(BANNER_PATH, path.join(BANNER_DIR, backupName));
      console.log(`💾 Backup: ${backupName}`);
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
      throw new Error("Buffer kosong, coba kirim ulang.");
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error(
        `Terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 5 MB)`,
      );

    fs.writeFileSync(BANNER_PATH, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);
    console.log(`✅ Banner tersimpan: ${sizeKB} KB`);

    await sock.sendMessage(jid, {
      image: buffer,
      caption:
        `✅ *BANNER DIPERBARUI!*\n\n` +
        `📁 Ukuran: ${sizeKB} KB\n` +
        `🕐 ${new Date().toLocaleString("id-ID")}\n` +
        `👤 Oleh: +${senderNumber}`,
    });
  } catch (err) {
    console.error(`❌ Gagal simpan banner: ${err.message}`);

    // Restore backup jika ada
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
        `❌ *GAGAL UPDATE BANNER*\n\n` +
        `Error: ${err.message}\n\n` +
        `Ketik *edit_banner* untuk coba lagi.`,
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
    }
  } catch (e) {}
}

// ==========================================
// ADMIN MENU SECTION
// Tampil berbeda untuk Owner vs Admin
// ==========================================
function getAdminMenuSection(senderNumber) {
  logAccess("getAdminMenuSection", senderNumber, isAdminOrOwner(senderNumber));

  const admins = loadAdmins();
  const owner = isOwner(senderNumber);
  const role = owner ? "👑 Owner" : "🛡️ Admin";
  const bannerExists = fs.existsSync(BANNER_PATH);

  // Baris untuk semua (owner + admin)
  const commonRows = [
    {
      header: "📋",
      title: "Daftar Admin Bot",
      description: `Owner + ${admins.length} admin terdaftar`,
      id: "admin_list",
    },
    {
      header: "📦",
      title: "Daftar Pesanan",
      description: "Lihat semua order masuk",
      id: "admin_orders",
    },
    {
      header: "🖼️",
      title: "Edit Banner Menu",
      description: bannerExists
        ? "Ganti banner (sudah ada)"
        : "Upload banner (belum ada)",
      id: "admin_banner",
    },
    {
      header: "👥",
      title: "Group Admin Manager",
      description: "Promote / Demote admin group",
      id: "admin_group",
    },
  ];

  // Baris khusus owner
  const ownerOnlyRows = [
    {
      header: "➕",
      title: "Tambah Admin Bot",
      description: "Tambah admin bot baru",
      id: "admin_add",
    },
    {
      header: "➖",
      title: "Hapus Admin Bot",
      description: `Hapus dari ${admins.length} admin terdaftar`,
      id: "admin_del",
    },
  ];

  return {
    title: `🔐 Panel Admin [${role}]`,
    highlight_label: "Restricted",
    rows: owner ? [...ownerOnlyRows, ...commonRows] : commonRows,
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Core functions
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,
  handleEditBanner,
  handleIncomingImage,
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,

  // Database
  loadAdmins,
  saveAdmins,

  // Role checks
  isOwner,
  isAdmin,
  isAdminOrOwner,

  // Utils
  normalizeNumber,
  getNumberFromJid,
  cleanNumber,
  jidToDigits,
};
