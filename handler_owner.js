// ==========================================
//  HANDLER_OWNER.JS
//  Khusus: Owner Bot Panel
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

const ADMINS_PATH = path.join(__dirname, "database", "admin.json");

// ==========================================
// LOAD / SAVE ADMINS
// ==========================================
function loadAdmins() {
  try {
    if (!fs.existsSync(ADMINS_PATH)) return [];
    const data = fs.readFileSync(ADMINS_PATH, "utf-8").trim();
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error("❌ loadAdmins error:", e.message);
    return [];
  }
}

function saveAdmins(admins) {
  try {
    const dir = path.dirname(ADMINS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ADMINS_PATH, JSON.stringify(admins, null, 2));
  } catch (e) {
    console.error("❌ saveAdmins error:", e.message);
  }
}

// ==========================================
// NORMALIZE NUMBER
// Hapus karakter non-digit, pastikan format 62xxx
// ==========================================
function normalizeNumber(num) {
  if (!num) return "";
  // Hapus semua non-digit
  let n = String(num).replace(/\D/g, "");
  // Ganti awalan 0 → 62
  if (n.startsWith("0")) n = "62" + n.slice(1);
  // Tambah 62 jika belum ada
  if (!n.startsWith("62") && n.length >= 8) n = "62" + n;
  return n;
}

// ==========================================
// CLEAN NUMBER - Bersihkan angka saja
// ==========================================
function cleanNumber(num) {
  if (!num) return "";
  return String(num).replace(/\D/g, "");
}

// ==========================================
// JID TO DIGITS
// "628xxx@s.whatsapp.net" → "628xxx"
// "628xxx:12@s.whatsapp.net" → "628xxx"
// ==========================================
function jidToDigits(jid) {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0];
}

// ==========================================
// GET NUMBER FROM JID (alias)
// ==========================================
function getNumberFromJid(jid) {
  return jidToDigits(jid);
}

// ==========================================
// IS LID FORMAT
// Cek apakah JID adalah format LID
// "180762842239208:20@lid" → true
// "628xxx@s.whatsapp.net"  → false
// ==========================================
function isLidFormat(jid) {
  if (!jid) return false;
  return jid.endsWith("@lid") || jid.includes("@lid");
}

// ==========================================
// IS PHONE NUMBER FORMAT
// Cek apakah JID adalah nomor HP biasa
// ==========================================
function isPhoneJid(jid) {
  if (!jid) return false;
  return jid.endsWith("@s.whatsapp.net");
}

// ==========================================
// ✅ RESOLVE JID TO PHONE NUMBER
// Core function: konversi JID/LID → nomor HP
//
// Priority:
// 1. Jika @s.whatsapp.net → langsung extract
// 2. Jika @lid → cari di contacts/store
// 3. Fallback: coba gunakan digits-nya
//
// @param {string} jid - JID atau LID
// @param {object} sock - WhatsApp socket (untuk lookup)
// @param {object} store - InMemoryStore (opsional)
// @returns {Promise<string>} - Nomor HP (digits only, e.g. "628xxx")
// ==========================================
async function resolveJidToPhone(jid, sock = null, store = null) {
  if (!jid) return "";

  // ── Case 1: Format biasa @s.whatsapp.net ──
  if (isPhoneJid(jid)) {
    return jidToDigits(jid);
  }

  // ── Case 2: Format LID @lid ──
  if (isLidFormat(jid)) {
    console.log(`🔍 Resolving LID: ${jid}`);

    // Coba via store contacts
    if (store) {
      try {
        const contacts = store.contacts || {};

        // Cari contact yang memiliki lid sesuai
        for (const [contactJid, contact] of Object.entries(contacts)) {
          if (
            contact?.lid === jid ||
            contact?.lid?.split("@")[0] === jid.split("@")[0].split(":")[0]
          ) {
            if (isPhoneJid(contactJid)) {
              const phone = jidToDigits(contactJid);
              console.log(`✅ LID resolved via store: ${jid} → ${phone}`);
              return phone;
            }
          }
        }

        // Coba cari berdasarkan bagian numerik LID
        const lidNum = jid.split("@")[0].split(":")[0];
        for (const [contactJid, contact] of Object.entries(contacts)) {
          const contactLid = (contact?.lid || "").split("@")[0].split(":")[0];
          if (contactLid === lidNum && isPhoneJid(contactJid)) {
            const phone = jidToDigits(contactJid);
            console.log(
              `✅ LID resolved via store (num match): ${jid} → ${phone}`,
            );
            return phone;
          }
        }
      } catch (e) {
        console.error(`⚠️ Store lookup error: ${e.message}`);
      }
    }

    // Coba via sock.contacts
    if (sock) {
      try {
        const contacts = sock.contacts || {};
        for (const [contactJid, contact] of Object.entries(contacts)) {
          if (
            contact?.lid === jid ||
            (contact?.lid || "").split("@")[0].split(":")[0] ===
              jid.split("@")[0].split(":")[0]
          ) {
            if (isPhoneJid(contactJid)) {
              const phone = jidToDigits(contactJid);
              console.log(
                `✅ LID resolved via sock.contacts: ${jid} → ${phone}`,
              );
              return phone;
            }
          }
        }
      } catch (e) {
        console.error(`⚠️ sock.contacts lookup error: ${e.message}`);
      }
    }

    // Fallback: ambil digits dari LID (ini BUKAN nomor HP, tapi last resort)
    const lidDigits = jid.split("@")[0].split(":")[0];
    console.warn(`⚠️ LID tidak bisa di-resolve: ${jid} → digits: ${lidDigits}`);
    console.warn(`⚠️ Kemungkinan bukan nomor HP yang valid`);
    return lidDigits; // return kosong lebih aman daripada salah
  }

  // ── Case 3: Format lain (misal hanya angka) ──
  return cleanNumber(jid.split("@")[0].split(":")[0]);
}

// ==========================================
// IS OWNER
// ==========================================
function isOwner(number) {
  if (!number) return false;
  const n = normalizeNumber(String(number).replace(/\D/g, ""));
  const o = normalizeNumber(String(config.ownerNumber).replace(/\D/g, ""));
  return n === o;
}

// ==========================================
// IS ADMIN BOT
// ==========================================
function isAdminBot(number) {
  if (!number) return false;
  const n = normalizeNumber(String(number).replace(/\D/g, ""));
  const admins = loadAdmins();
  return admins.some(
    (a) => normalizeNumber(String(a).replace(/\D/g, "")) === n,
  );
}

// ==========================================
// IS ADMIN OR OWNER
// ==========================================
function isAdminOrOwner(number) {
  return isOwner(number) || isAdminBot(number);
}

// ==========================================
// OWNER MENU SECTION
// ==========================================
function getOwnerMenuSection() {
  const admins = loadAdmins();
  return {
    title: "👑 Panel Owner",
    highlight_label: "Owner Only",
    rows: [
      {
        header: "📋",
        title: "Kelola Admin Bot",
        description: `${admins.length} admin terdaftar`,
        id: "owner_manage_admin",
      },
      {
        header: "📦",
        title: "Daftar Pesanan",
        description: "Lihat semua order masuk",
        id: "owner_orders",
      },
      {
        header: "📊",
        title: "Statistik",
        description: "Statistik bot & revenue",
        id: "owner_stats",
      },
      {
        header: "🖼️",
        title: "Edit Banner",
        description: "Ganti banner menu utama",
        id: "owner_banner",
      },
      {
        header: "👥",
        title: "Group Manager",
        description: "Kelola admin grup WhatsApp",
        id: "owner_group_manager",
      },
    ],
  };
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
    `║  📋 *KELOLA ADMIN BOT*   ║\n` +
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
// OWNER: ADD ADMIN (dengan mention support)
// ==========================================
async function handleOwnerAddAdmin(
  sock,
  msg,
  jid,
  senderNumber,
  rawText,
  store = null,
) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  let target = "";
  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length > 0) {
    // ✅ Resolve mention (bisa LID atau phone JID)
    target = await resolveJidToPhone(mentions[0], sock, store);
    target = normalizeNumber(target);
    console.log(`🔍 Owner addadmin via mention: ${mentions[0]} → ${target}`);
  } else {
    const parts = rawText.split(/\s+/);
    if (parts.length >= 2) target = normalizeNumber(parts[1]);
  }

  if (!target || target.length < 10) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format Salah*\n\n` +
        `Gunakan salah satu:\n` +
        `• Mention: \`/addadmin @nomor\`\n` +
        `• Manual: \`/addadmin 628xxxxxxxxxx\``,
    });
    return;
  }

  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: `👑 *+${target}* adalah Owner sendiri.`,
    });
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
  console.log(`✅ [OWNER] Admin ditambahkan: +${target} oleh +${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN BOT DITAMBAHKAN*\n\n` +
      `📱 Nomor: +${target}\n` +
      `👤 Ditambahkan oleh: Owner\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: DEL ADMIN (command)
// ==========================================
async function handleOwnerDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
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
// OWNER: DEL ADMIN (dari list)
// ==========================================
async function handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const target = rawId.replace("owner_deladmin_", "");
  await executeOwnerDeleteAdmin(sock, jid, senderNumber, target);
}

// ==========================================
// EXECUTE: DELETE ADMIN (Owner)
// ==========================================
async function executeOwnerDeleteAdmin(sock, jid, senderNumber, target) {
  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: `⛔ Tidak bisa menghapus Owner.`,
    });
    return;
  }

  if (!isAdminBot(target)) {
    await sock.sendMessage(jid, {
      text: `❌ *+${target}* bukan admin bot.`,
    });
    return;
  }

  const admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);
  console.log(`🗑️ [OWNER] Admin dihapus: +${target} oleh +${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN BOT DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `👤 Dihapus oleh: Owner\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// OWNER: LIST ADMIN UNTUK HAPUS
// ==========================================
async function handleOwnerDelAdminList(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const admins = loadAdmins();

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *HAPUS ADMIN*\n\n_Belum ada admin._`,
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
      `Total: *${admins.length}* admin`,
    footer: "Owner Panel",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Admin",
          sections: [{ title: "🛡️ Admin Bot", rows }],
        }),
      },
    ],
  });
}

// ==========================================
// OWNER: LIST ORDERS
// ==========================================
async function handleOwnerListOrders(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const pakasir = require("./pakasir");
  const orders = pakasir.getAllOrders(20);

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
// OWNER: STATS
// ==========================================
async function handleOwnerStats(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const pakasir = require("./pakasir");
  const all = pakasir.loadOrders();
  const admins = loadAdmins();
  const completed = all.filter((o) => o.status === "completed");
  const revenue = completed.reduce((s, o) => s + o.amount, 0);

  const text =
    `╔══════════════════════════╗\n` +
    `║  📊 *STATISTIK BOT*      ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Admin:*\n` +
    `├ 👑 Owner: 1\n` +
    `└ 🛡️ Admin Bot: ${admins.length}\n\n` +
    `📦 *Order:*\n` +
    `├ 📦 Total: ${all.length}\n` +
    `├ ✅ Completed: ${completed.length}\n` +
    `├ ⏳ Pending: ${all.filter((o) => o.status === "pending").length}\n` +
    `├ 🚫 Cancelled: ${all.filter((o) => o.status === "cancelled").length}\n` +
    `└ ⏰ Expired: ${all.filter((o) => o.status === "expired").length}\n\n` +
    `💰 *Revenue:*\n` +
    `└ ${pakasir.formatRupiah(revenue)}\n\n` +
    `📅 ${new Date().toLocaleString("id-ID")}`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// OWNER ROUTER
// ==========================================
async function handleOwnerRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isOwner(senderNumber)) return;

  switch (rawId) {
    case "owner_manage_admin":
      await handleOwnerListAdmin(sock, jid, senderNumber);
      break;
    case "owner_add_admin":
      await sock.sendMessage(jid, {
        text:
          `➕ *TAMBAH ADMIN BOT*\n\n` +
          `Kirim dengan salah satu cara:\n\n` +
          `• *Mention:* \`/addadmin @nomor\`\n` +
          `• *Manual:* \`/addadmin 628xxxxxxxxxx\``,
      });
      break;
    case "owner_list_admin":
      await handleOwnerListAdmin(sock, jid, senderNumber);
      break;
    case "owner_del_admin":
      await handleOwnerDelAdminList(sock, jid, senderNumber);
      break;
    case "owner_orders":
      await handleOwnerListOrders(sock, jid, senderNumber);
      break;
    case "owner_stats":
      await handleOwnerStats(sock, jid, senderNumber);
      break;
    default:
      if (rawId.startsWith("owner_deladmin_")) {
        await handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId);
      }
      break;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Data
  loadAdmins,
  saveAdmins,

  // Checks
  isOwner,
  isAdminBot,
  isAdminOrOwner,

  // Number utils
  normalizeNumber,
  cleanNumber,
  jidToDigits,
  getNumberFromJid,
  isLidFormat,
  isPhoneJid,

  // ✅ NEW: Resolve LID
  resolveJidToPhone,

  // Handlers
  getOwnerMenuSection,
  handleOwnerRouter,
  handleOwnerListAdmin,
  handleOwnerAddAdmin,
  handleOwnerDelAdmin,
  handleOwnerDelAdminFromList,
  handleOwnerListOrders,
  handleOwnerStats,
};
