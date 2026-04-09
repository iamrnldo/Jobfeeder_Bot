// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

// ==========================================
// PATH DATABASE ADMIN
// ==========================================
const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");
const MENU_CONFIG_PATH = path.join(__dirname, "database", "menu_config.json");

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
// MENU CONFIG FUNCTIONS
// ==========================================
function loadMenuConfig() {
  try {
    const dir = path.dirname(MENU_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(MENU_CONFIG_PATH)) {
      const defaultConfig = {
        menuImageUrl: "[picsum.photos](https://picsum.photos/800/400)",
        menuImagePath: null,
        menuImageCaption: "🤖 Selamat datang di JobFeeder Bot!",
        updatedAt: null,
        updatedBy: null,
      };
      fs.writeFileSync(
        MENU_CONFIG_PATH,
        JSON.stringify(defaultConfig, null, 2),
      );
      return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(MENU_CONFIG_PATH, "utf-8"));
  } catch {
    return {
      menuImageUrl: "[picsum.photos](https://picsum.photos/800/400)",
      menuImagePath: null,
      menuImageCaption: "🤖 Selamat datang di JobFeeder Bot!",
      updatedAt: null,
      updatedBy: null,
    };
  }
}

function saveMenuConfig(cfg) {
  const dir = path.dirname(MENU_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MENU_CONFIG_PATH, JSON.stringify(cfg, null, 2));
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

// ==========================================
// STATE: PENDING MENU PHOTO UPDATE
// ==========================================
const pendingMenuPhotoUpdate = new Set();

function isPendingMenuPhoto(senderNumber) {
  return pendingMenuPhotoUpdate.has(senderNumber);
}

// ==========================================
// HANDLER: ADD ADMIN
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
    await sock.sendMessage(jid, {
      text: "👑 Nomor tersebut adalah Owner.",
    });
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
// HANDLER: DEL ADMIN (dari command)
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
// HANDLER: DEL ADMIN (dari interactive list)
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
// EXECUTE DELETE ADMIN (shared logic)
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

  console.log(`🗑️ Admin dihapus: ${target} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: ${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// KIRIM DAFTAR ADMIN
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
// KIRIM INTERACTIVE LIST UNTUK DELETE ADMIN
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
// ADMIN: HANDLER UPDATE FOTO MENU
// ==========================================
async function handleUpdateMenuPhoto(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  pendingMenuPhotoUpdate.add(senderNumber);

  await sock.sendMessage(jid, {
    text:
      `📸 *UPDATE FOTO MENU*\n\n` +
      `Kirim foto yang ingin dijadikan\n` +
      `gambar untuk tampilan */menu*\n\n` +
      `⚠️ *Ketentuan:*\n` +
      `• Format: JPG / PNG\n` +
      `• Resolusi minimal: 400x200\n` +
      `• Kirim sebagai *foto* (bukan dokumen)\n\n` +
      `Atau ketik */cancelfoto* untuk batal.`,
  });
}

// ==========================================
// ADMIN: HANDLE UPLOAD FOTO MENU
// ==========================================
async function handleMenuPhotoUpload(sock, jid, senderNumber, msg) {
  if (!pendingMenuPhotoUpdate.has(senderNumber)) return false;

  const m = msg.message;
  const imageMsg = m?.imageMessage;

  if (!imageMsg) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Bukan foto!*\n\n` +
        `Kirim sebagai *foto* (bukan dokumen).\n` +
        `Atau ketik */cancelfoto* untuk batal.`,
    });
    return true;
  }

  try {
    await sock.sendMessage(jid, { text: `⏳ Menyimpan foto menu...` });

    const { downloadMediaMessage } = require("atexovi-baileys");
    const buffer = await downloadMediaMessage(msg, "buffer", {});

    const menuImgDir = path.join(__dirname, "database");
    if (!fs.existsSync(menuImgDir))
      fs.mkdirSync(menuImgDir, { recursive: true });

    const menuImgPath = path.join(menuImgDir, "menu_image.jpg");
    fs.writeFileSync(menuImgPath, buffer);

    const menuConfig = loadMenuConfig();
    menuConfig.menuImagePath = menuImgPath;
    menuConfig.menuImageUrl = null;
    menuConfig.updatedAt = new Date().toISOString();
    menuConfig.updatedBy = senderNumber;
    saveMenuConfig(menuConfig);

    pendingMenuPhotoUpdate.delete(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `✅ *FOTO MENU DIPERBARUI!*\n\n` +
        `Gambar berhasil disimpan.\n` +
        `Ketik */menu* untuk melihat hasilnya! 👀\n\n` +
        `📅 Diperbarui: ${new Date().toLocaleString("id-ID")}\n` +
        `👤 Oleh: ${senderNumber}`,
    });

    console.log(`📸 Menu image updated by ${senderNumber}`);
    return true;
  } catch (err) {
    console.error("❌ Gagal simpan foto menu:", err.message);
    pendingMenuPhotoUpdate.delete(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MENYIMPAN FOTO*\n\n` +
        `Error: ${err.message}\n\n` +
        `Coba lagi dengan ketik */updatemenu*`,
    });
    return true;
  }
}

// ==========================================
// ADMIN: CANCEL UPDATE FOTO MENU
// ==========================================
async function handleCancelMenuPhoto(sock, jid, senderNumber) {
  if (pendingMenuPhotoUpdate.has(senderNumber)) {
    pendingMenuPhotoUpdate.delete(senderNumber);
    await sock.sendMessage(jid, {
      text: `🚫 *Update foto menu dibatalkan.*\n\nKetik */menu* untuk kembali.`,
    });
  } else {
    await sock.sendMessage(jid, {
      text: `ℹ️ Tidak ada proses update foto yang aktif.`,
    });
  }
}

// ==========================================
// KIRIM SECTION ADMIN PANEL (untuk menu utama)
// ==========================================
function getAdminMenuSection(senderNumber) {
  const admins = loadAdmins();
  const role = isOwner(senderNumber) ? "👑 Owner" : "🛡️ Admin";

  return {
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
      {
        header: "📸",
        title: "Update Foto Menu",
        description: "Ganti gambar tampilan /menu",
        id: "admin_update_menu_photo",
      },
    ],
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Handler functions
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,

  // Menu photo
  handleUpdateMenuPhoto,
  handleMenuPhotoUpload,
  handleCancelMenuPhoto,
  isPendingMenuPhoto,

  // Menu config
  loadMenuConfig,
  saveMenuConfig,

  // Send functions
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,

  // Utility
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  normalizeNumber,
  getNumberFromJid,
};
