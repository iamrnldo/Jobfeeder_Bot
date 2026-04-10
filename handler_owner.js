// ==========================================
//  HANDLER_OWNER.JS
//  Khusus: Owner Panel
//  Full akses semua fitur
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");
const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");

// ==========================================
// SHARED HELPERS (dipakai semua handler)
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

function getNumberFromJid(jid) {
  return jidToDigits(jid);
}

function cleanNumber(jid) {
  return jidToDigits(jid);
}

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

function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

// Tambahkan di handler_owner.js
// Ganti fungsi isAdminBot yang lama

function isAdminBot(number) {
  const admins = loadAdmins();
  // ✅ normalizeNumber strip semua non-digit termasuk device suffix
  const n = normalizeNumber(number);
  return admins.some((a) => {
    const an = normalizeNumber(a);
    // Exact match
    if (an === n) return true;
    // Suffix match 8 digit (toleran perbedaan kode negara)
    if (an.length >= 8 && n.length >= 8 && an.slice(-8) === n.slice(-8))
      return true;
    return false;
  });
}

function isAdminOrOwner(number) {
  return isOwner(number) || isAdminBot(number);
}

// ==========================================
// OWNER PANEL MENU
// ==========================================
function getOwnerMenuSection() {
  const admins = loadAdmins();
  const bannerExists = fs.existsSync(BANNER_PATH);

  return {
    title: "👑 Owner Panel",
    highlight_label: "Owner Only",
    rows: [
      {
        header: "👥",
        title: "Manajemen Admin Bot",
        description: `Tambah/Hapus/Lihat admin (${admins.length} terdaftar)`,
        id: "owner_manage_admin",
      },
      {
        header: "👥",
        title: "Group Admin Manager",
        description: "Promote/Demote/Lihat admin group",
        id: "owner_group_manager",
      },
      {
        header: "📦",
        title: "Daftar Semua Pesanan",
        description: "Lihat semua order masuk",
        id: "owner_orders",
      },
      {
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner (sudah ada)"
          : "Upload banner (belum ada)",
        id: "owner_banner",
      },
      {
        header: "📊",
        title: "Statistik Bot",
        description: "Uptime, total pesan, total order",
        id: "owner_stats",
      },
    ],
  };
}

// ==========================================
// OWNER: MANAJEMEN ADMIN BOT
// ==========================================
async function handleOwnerManageAdmin(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const admins = loadAdmins();

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👑 *MANAJEMEN ADMIN BOT*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status:*\n` +
      `├ 👑 Owner: +${config.ownerNumber}\n` +
      `└ 🛡️ Admin: ${admins.length} terdaftar\n\n` +
      `Pilih aksi 👇`,
    footer: "👑 Owner Panel",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "⚙️ Kelola Admin Bot",
          sections: [
            {
              title: "👑 Aksi Admin Bot",
              rows: [
                {
                  header: "➕",
                  title: "Tambah Admin Bot",
                  description: "Tambah admin bot baru",
                  id: "owner_add_admin",
                },
                {
                  header: "➖",
                  title: "Hapus Admin Bot",
                  description: `Hapus dari ${admins.length} admin`,
                  id: "owner_del_admin",
                },
                {
                  header: "📋",
                  title: "Lihat Daftar Admin Bot",
                  description: "Tampilkan semua admin bot",
                  id: "owner_list_admin",
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
// OWNER: TAMBAH ADMIN BOT
// ==========================================
async function handleOwnerAddAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
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

  if (isAdminBot(target)) {
    await sock.sendMessage(jid, {
      text: `⚠️ *+${target}* sudah menjadi admin bot.`,
    });
    return;
  }

  const admins = loadAdmins();
  admins.push(target);
  saveAdmins(admins);
  console.log(`✅ [OWNER] Admin ditambahkan: +${target}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN BOT DITAMBAHKAN*\n\n` +
      `📱 Nomor: +${target}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: HAPUS ADMIN BOT (command)
// ==========================================
async function handleOwnerDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const parts = rawText.split(/\s+/);
  const target = parts.length >= 2 ? normalizeNumber(parts[1]) : "";

  if (!target || target.length < 10) {
    await sock.sendMessage(jid, {
      text: "❌ Format: `/deladmin 628xxxxxxxxxx`",
    });
    return;
  }

  await executeOwnerDeleteAdmin(sock, jid, senderNumber, target);
}

// ==========================================
// OWNER: HAPUS ADMIN BOT (dari list)
// ==========================================
async function handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const target = rawId.replace("owner_deladmin_", "");
  await executeOwnerDeleteAdmin(sock, jid, senderNumber, target);
}

// ==========================================
// EXECUTE: HAPUS ADMIN BOT
// ==========================================
async function executeOwnerDeleteAdmin(sock, jid, senderNumber, target) {
  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: "⛔ Tidak bisa menghapus Owner." });
    return;
  }

  if (!isAdminBot(target)) {
    await sock.sendMessage(jid, { text: `❌ *+${target}* bukan admin bot.` });
    return;
  }

  const admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);
  console.log(`🗑️ [OWNER] Admin dihapus: +${target}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN BOT DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: LIST ADMIN BOT
// ==========================================
async function handleOwnerListAdmin(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const admins = loadAdmins();

  let text =
    `╔══════════════════════════╗\n` +
    `║  📋 *DAFTAR ADMIN BOT*   ║\n` +
    `╚══════════════════════════╝\n\n` +
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
// OWNER: LIST HAPUS ADMIN (pilihan)
// ==========================================
async function handleOwnerDelAdminList(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const admins = loadAdmins().filter((a) => !isOwner(a));

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *HAPUS ADMIN BOT*\n\n_Belum ada admin._`,
    });
    return;
  }

  const rows = admins.map((a, i) => ({
    header: `Admin #${i + 1}`,
    title: `+${a}`,
    description: `Hapus +${a} dari daftar admin`,
    id: `owner_deladmin_${a}`,
  }));

  await sock.sendMessage(jid, {
    text:
      `🗑️ *HAPUS ADMIN BOT*\n\n` +
      `Pilih admin yang ingin dihapus.\n` +
      `Total: *${admins.length}*`,
    footer: "⚠️ Owner tidak bisa dihapus",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Admin",
          sections: [{ title: "🛡️ Daftar Admin Bot", rows }],
        }),
      },
    ],
  });
}

// ==========================================
// OWNER: DAFTAR PESANAN
// ==========================================
async function handleOwnerListOrders(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
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
// OWNER ROUTER
// ==========================================
async function handleOwnerRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isOwner(senderNumber)) return;

  // Manage admin menu
  if (rawId === "owner_manage_admin") {
    await handleOwnerManageAdmin(sock, jid, senderNumber);
    return;
  }

  // Tambah admin
  if (rawId === "owner_add_admin") {
    await sock.sendMessage(jid, {
      text:
        `➕ *TAMBAH ADMIN BOT*\n\n` +
        `Kirim nomor admin baru:\n` +
        `\`\`\`/addadmin 628xxxxxxxxxx\`\`\``,
    });
    return;
  }

  // List admin
  if (rawId === "owner_list_admin") {
    await handleOwnerListAdmin(sock, jid, senderNumber);
    return;
  }

  // Hapus admin (tampilkan list)
  if (rawId === "owner_del_admin") {
    await handleOwnerDelAdminList(sock, jid, senderNumber);
    return;
  }

  // Hapus admin dari list
  if (rawId.startsWith("owner_deladmin_")) {
    await handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId);
    return;
  }

  // Daftar pesanan
  if (rawId === "owner_orders") {
    await handleOwnerListOrders(sock, jid, senderNumber);
    return;
  }

  // Group manager → delegate ke handler_admin_group
  if (rawId === "owner_group_manager") {
    const { handleGroupManager } = require("./handler_admin_group");
    await handleGroupManager(sock, jid, senderNumber);
    return;
  }

  // Edit banner → delegate ke handler_admin
  if (rawId === "owner_banner") {
    const { handleEditBanner } = require("./handler_admin");
    await handleEditBanner(sock, jid, senderNumber);
    return;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Panel
  getOwnerMenuSection,
  handleOwnerManageAdmin,
  handleOwnerRouter,

  // Admin management
  handleOwnerAddAdmin,
  handleOwnerDelAdmin,
  handleOwnerDelAdminFromList,
  handleOwnerListAdmin,
  handleOwnerListOrders,

  // Shared helpers (diexport agar bisa dipakai file lain)
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdminBot,
  isAdminOrOwner,
  normalizeNumber,
  jidToDigits,
  getNumberFromJid,
  cleanNumber,
};
