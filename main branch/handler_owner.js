// ==========================================
//  HANDLER_OWNER.JS - Full Akses Owner Panel
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  resolveMentionToPhone,
  isLidJid,
  jidToDigits: resolverJidToDigits,
} = require("./lid_resolver");

const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");
const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");

// Helpers
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

function isAdminBot(number) {
  const admins = loadAdmins();
  const n = normalizeNumber(number);
  return admins.some((a) => {
    const an = normalizeNumber(a);
    if (an === n) return true;
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
  return {
    title: "👑 Owner Panel",
    highlight_label: "Owner Only",
    rows: [
      // ❌ HAPUS baris announce dari sini
      // announce akan ditambah di sendMainMenu() HANYA jika isPrivate
      {
        header: "👥",
        title: "Manajemen Admin Bot",
        description: `Tambah/Hapus/Lihat admin (${admins.length})`,
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
        description: "Ganti banner menu",
        id: "owner_banner",
      },
    ],
  };
}

// ==========================================
// HANDLE OWNER MANAGE ADMIN
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
// OWNER: TAMBAH ADMIN BOT (Support Mention & LID)
// ==========================================
async function handleOwnerAddAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK* — Hanya Owner." });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const groupJid = jid.endsWith("@g.us") ? jid : null;

  let target = "";
  let sourceInfo = "";
  let resolvedFromLid = false;

  // Prioritas 1: Nomor langsung dari teks
  const parts = rawText.trim().split(/\s+/);
  if (parts.length >= 2 && !parts[1].startsWith("@")) {
    target = normalizeNumber(parts[1]);
    sourceInfo = "nomor langsung";
  }

  // Prioritas 2: @mention
  if (!target && mentions.length > 0) {
    const mentionJid = mentions[0];

    if (isLidJid(mentionJid)) {
      await sock.sendMessage(jid, {
        text: `⏳ _Memproses mention (resolving LID)..._`,
      });

      const resolved = await resolveMentionToPhone(sock, mentionJid, groupJid);

      if (resolved && resolved.length >= 8) {
        target = resolved;
        sourceInfo = `mention (LID resolved ✅)`;
        resolvedFromLid = true;
      } else {
        await sock.sendMessage(jid, {
          text:
            `⚠️ *MENTION TIDAK BISA DIPROSES*\n\n` +
            `WhatsApp menggunakan *LID* (ID internal) untuk\n` +
            `user ini dan tidak bisa di-resolve.\n\n` +
            `✅ *Gunakan nomor HP langsung:*\n` +
            `\`\`\`/addadmin 628xxxxxxxxxx\`\`\``,
        });
        return;
      }
    } else {
      target = jidToDigits(mentionJid);
      sourceInfo = "mention (nomor HP)";
    }
  }

  // Validasi
  if (!target || target.length < 8) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `✅ *Cara pakai:*\n` +
        `• Mention: \`/addadmin @username\`\n` +
        `• Nomor: \`/addadmin 628xxxxxxxxxx\``,
    });
    return;
  }

  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: `👑 *+${target}* adalah Owner.` });
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

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN BOT DITAMBAHKAN*\n\n` +
      `📱 Nomor HP: *+${target}*\n` +
      `📌 Sumber: ${sourceInfo}\n` +
      `${resolvedFromLid ? "🔄 _LID berhasil di-resolve_\n" : ""}` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: HAPUS ADMIN BOT (Command + Mention)
// ==========================================
async function handleOwnerDelAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const parts = rawText.split(/\s+/);
  const mentions =
    msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const groupJid = jid.endsWith("@g.us") ? jid : null;

  let target = "";

  // Nomor langsung
  if (parts.length >= 2 && !parts[1].startsWith("@")) {
    target = normalizeNumber(parts[1]);
  }

  // Mention
  if (!target && mentions.length > 0) {
    const mentionJid = mentions[0];

    if (isLidJid(mentionJid)) {
      await sock.sendMessage(jid, { text: `⏳ _Resolving mention..._` });
      const resolved = await resolveMentionToPhone(sock, mentionJid, groupJid);
      if (resolved) {
        target = resolved;
      } else {
        await sock.sendMessage(jid, {
          text:
            `⚠️ *MENTION TIDAK BISA DIPROSES (LID)*\n\n` +
            `Gunakan:\n\`\`\`/deladmin 628xxxxxxxxxx\`\`\``,
        });
        return;
      }
    } else {
      target = jidToDigits(mentionJid);
    }
  }

  if (!target || target.length < 8) {
    await sock.sendMessage(jid, {
      text: `❌ *Format:*\n\`\`\`/deladmin 628xxxxxxxxxx\`\`\` or \`/deladmin @username\``,
    });
    return;
  }

  await executeOwnerDeleteAdmin(sock, jid, senderNumber, target);
}

async function handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }
  const target = rawId.replace("owner_deladmin_", "");
  await executeOwnerDeleteAdmin(sock, jid, senderNumber, target);
}

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

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN BOT DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: LIST ADMIN
// ==========================================
async function handleOwnerListAdmin(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
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

async function handleOwnerDelAdminList(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
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
    description: `Hapus +${a}`,
    id: `owner_deladmin_${a}`,
  }));

  await sock.sendMessage(jid, {
    text: `🗑️ *HAPUS ADMIN BOT*\n\nPilih admin yang ingin dihapus.\nTotal: *${admins.length}*`,
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
// OWNER: DAFTAR ORDER
// ==========================================
async function handleOwnerListOrders(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const pakasir = require("./pakasir");
  const orders = pakasir.getAllOrders(15);
  const all = pakasir.loadOrders();

  if (orders.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *DAFTAR ORDER*\n\n_Belum ada order._`,
    });
    return;
  }

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

  if (rawId === "owner_manage_admin") {
    await handleOwnerManageAdmin(sock, jid, senderNumber);
  } else if (rawId === "owner_add_admin") {
    await sock.sendMessage(jid, {
      text:
        `➕ *TAMBAH ADMIN BOT*\n\n` +
        `Ketik:\n\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n\n` +
        `atau mention:\n\`\`\`/addadmin @username\`\`\``,
    });
  } else if (rawId === "owner_list_admin") {
    await handleOwnerListAdmin(sock, jid, senderNumber);
  } else if (rawId === "owner_del_admin") {
    await handleOwnerDelAdminList(sock, jid, senderNumber);
  } else if (rawId.startsWith("owner_deladmin_")) {
    await handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId);
  } else if (rawId === "owner_orders") {
    await handleOwnerListOrders(sock, jid, senderNumber);
  } else if (rawId === "owner_group_manager") {
    const { handleGroupManager } = require("./handler_admin_group");
    await handleGroupManager(sock, jid, senderNumber);
  } else if (rawId === "owner_banner") {
    const { handleEditBanner } = require("./handler_admin");
    await handleEditBanner(sock, jid, senderNumber);
  }
}

// Export
module.exports = {
  getOwnerMenuSection,
  handleOwnerManageAdmin,
  handleOwnerRouter,
  handleOwnerAddAdmin,
  handleOwnerDelAdmin,
  handleOwnerDelAdminFromList,
  handleOwnerListAdmin,
  handleOwnerListOrders,
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdminBot,
  isAdminOrOwner,
  normalizeNumber,
  jidToDigits,
  isLidJid,
};
