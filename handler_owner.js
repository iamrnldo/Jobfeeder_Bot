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
// SHARED HELPERS
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

// ==========================================
// ✅ CEK APAKAH JID ADALAH LID
// LID format: "xxxxx@lid" atau "xxxxx:0@lid"
// ==========================================
function isLidJid(jid) {
  if (!jid) return false;
  return jid.endsWith("@lid");
}

// ==========================================
// ✅ RESOLVE NOMOR DARI MENTION JID
//
// Masalah: saat @mention di group, JID yang
// didapat bisa berupa LID bukan nomor HP.
//
// LID: "38650712698961:0@lid"
// HP:  "6285707627202@s.whatsapp.net"
//
// Solusi: coba ambil nomor dari sock.store
// atau dari groupMetadata participants
// ==========================================
async function resolvePhoneFromMention(sock, mentionJid, groupJid) {
  const domain = (mentionJid.split("@")[1] || "").toLowerCase();

  // Bukan LID → langsung pakai
  if (domain !== "lid") {
    const number = jidToDigits(mentionJid);
    console.log(`📱 Mention non-LID: "${mentionJid}" → "${number}"`);
    return number;
  }

  // ── LID: coba resolve dari group participants ──
  console.log(`🔍 Mention LID: "${mentionJid}" → coba resolve...`);

  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const lidDigits = jidToDigits(mentionJid);

      for (const p of meta.participants) {
        const pDomain = (p.id.split("@")[1] || "").toLowerCase();
        const pDigits = jidToDigits(p.id);

        // Cari participant dengan LID yang sama
        if (pDomain === "lid" && pDigits === lidDigits) {
          // Cek apakah ada entry lain dengan nomor HP yang cocok
          // Baileys kadang punya dua entry: satu @lid satu @s.whatsapp.net
          console.log(`   Found LID match: "${p.id}"`);
        }

        // Jika participant bukan LID, coba cocokkan via suffix
        if (pDomain !== "lid" && pDigits.length >= 8 && lidDigits.length >= 8) {
          // Tidak bisa langsung cocokkan LID dengan nomor HP
          // LID dan nomor HP adalah identifier yang berbeda
        }
      }

      // Coba cari via contactStore jika tersedia
      const contact =
        sock.store?.contacts?.[mentionJid] ||
        sock.store?.contacts?.[mentionJid.replace("@lid", "@s.whatsapp.net")];

      if (contact) {
        const phone = contact.notify || contact.name || null;
        if (phone) {
          console.log(`   Contact store: "${phone}"`);
        }
      }
    } catch (e) {
      console.error(`   groupMetadata error: ${e.message}`);
    }
  }

  // ── Fallback: simpan LID digits sebagai identifier ──
  // Nanti saat cek isAdminBot(), akan dicocokkan dengan suffix
  const lidNumber = jidToDigits(mentionJid);
  console.log(`   ⚠️ LID tidak bisa di-resolve, simpan digits: "${lidNumber}"`);
  return lidNumber;
}

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
// ROLE CHECKS
// ==========================================
function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

// ✅ isAdminBot: cek exact match DAN suffix match
// untuk handle perbedaan LID vs nomor HP
function isAdminBot(number) {
  const admins = loadAdmins();
  const n = normalizeNumber(number);

  return admins.some((a) => {
    const an = normalizeNumber(a);

    // Exact match
    if (an === n) return true;

    // Suffix match 8 digit
    if (an.length >= 8 && n.length >= 8 && an.slice(-8) === n.slice(-8))
      return true;

    return false;
  });
}

function isAdminOrOwner(number) {
  return isOwner(number) || isAdminBot(number);
}

function ensureBannerDir() {
  const BANNER_DIR = path.join(__dirname, "images", "menu");
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
  }
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
    ],
  };
}

// ==========================================
// OWNER: MANAJEMEN ADMIN BOT
// ==========================================
async function handleOwnerManageAdmin(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
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
// ✅ OWNER: TAMBAH ADMIN BOT
//
// PENTING: Gunakan nomor HP langsung, BUKAN @mention
// karena @mention di group bisa menghasilkan LID
// yang berbeda dengan nomor HP.
//
// Cara yang benar:
//   /addadmin 628xxxxxxxxxx   ← nomor HP langsung ✅
//   /addadmin @user           ← bisa LID, tidak reliable ⚠️
// ==========================================
async function handleOwnerAddAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  let target = "";
  let usedMention = false;

  // ── Coba dari teks dulu (lebih reliable) ──
  const parts = rawText.trim().split(/\s+/);
  // parts[0] = "/addadmin", parts[1] = nomor atau @mention
  if (parts.length >= 2) {
    const raw = parts[1];
    // Jika tidak ada @, berarti nomor langsung
    if (!raw.startsWith("@")) {
      target = normalizeNumber(raw);
      console.log(`📱 addadmin via nomor langsung: "${target}"`);
    }
  }

  // ── Jika dari mention ──
  if (!target && mentions.length > 0) {
    const mentionJid = mentions[0];
    usedMention = true;

    if (isLidJid(mentionJid)) {
      // ⚠️ LID — tidak bisa di-resolve ke nomor HP
      // Minta owner input nomor langsung
      await sock.sendMessage(jid, {
        text:
          `⚠️ *TIDAK BISA PROSES MENTION INI*\n\n` +
          `WhatsApp menggunakan *LID* (ID internal) untuk\n` +
          `user ini, bukan nomor telepon.\n\n` +
          `LID: \`${mentionJid}\`\n\n` +
          `✅ *Gunakan nomor HP langsung:*\n` +
          `\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n\n` +
          `Tanya nomor HP-nya terlebih dahulu.`,
      });
      return;
    }

    // Mention dengan nomor HP normal
    target = jidToDigits(mentionJid);
    console.log(`📱 addadmin via mention: "${mentionJid}" → "${target}"`);
  }

  if (!target || target.length < 8) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah atau nomor tidak valid.*\n\n` +
        `✅ *Gunakan nomor HP langsung:*\n` +
        `\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n\n` +
        `⚠️ Hindari @mention — bisa menghasilkan\n` +
        `LID internal yang berbeda dengan nomor HP.`,
    });
    return;
  }

  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: "👑 Nomor tersebut adalah Owner.",
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
  console.log(`✅ [OWNER] Admin ditambahkan: +${target}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN BOT DITAMBAHKAN*\n\n` +
      `📱 Nomor: +${target}\n` +
      `${usedMention ? "⚠️ _Dari mention — pastikan nomor benar_\n" : ""}` +
      `📊 Total admin: ${admins.length}\n\n` +
      `_Admin bisa langsung akses panel dengan ketik *menu*_`,
  });
}

// ==========================================
// OWNER: HAPUS ADMIN BOT (command)
// ==========================================
async function handleOwnerDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
    return;
  }

  const parts = rawText.split(/\s+/);
  const target = parts.length >= 2 ? normalizeNumber(parts[1]) : "";

  if (!target || target.length < 8) {
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
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
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
    await sock.sendMessage(jid, {
      text: "⛔ Tidak bisa menghapus Owner.",
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
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
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

  text +=
    `\n📊 Total: ${admins.length + 1} (termasuk owner)\n\n` +
    `⚠️ _Pastikan nomor tersimpan adalah nomor HP,_\n` +
    `_bukan LID internal WhatsApp._`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// OWNER: LIST HAPUS ADMIN
// ==========================================
async function handleOwnerDelAdminList(sock, jid, senderNumber) {
  if (!isOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
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
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK* — Hanya Owner.",
    });
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

  if (rawId === "owner_manage_admin") {
    await handleOwnerManageAdmin(sock, jid, senderNumber);
    return;
  }

  if (rawId === "owner_add_admin") {
    await sock.sendMessage(jid, {
      text:
        `➕ *TAMBAH ADMIN BOT*\n\n` +
        `Ketik nomor HP langsung:\n` +
        `\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n\n` +
        `⚠️ *PENTING:* Gunakan nomor HP,\n` +
        `bukan @mention — karena @mention\n` +
        `di group bisa menghasilkan LID\n` +
        `yang berbeda dengan nomor HP.\n\n` +
        `Contoh:\n` +
        `\`\`\`/addadmin 6285707627202\`\`\``,
    });
    return;
  }

  if (rawId === "owner_list_admin") {
    await handleOwnerListAdmin(sock, jid, senderNumber);
    return;
  }

  if (rawId === "owner_del_admin") {
    await handleOwnerDelAdminList(sock, jid, senderNumber);
    return;
  }

  if (rawId.startsWith("owner_deladmin_")) {
    await handleOwnerDelAdminFromList(sock, jid, senderNumber, rawId);
    return;
  }

  if (rawId === "owner_orders") {
    await handleOwnerListOrders(sock, jid, senderNumber);
    return;
  }

  if (rawId === "owner_group_manager") {
    const { handleGroupManager } = require("./handler_admin_group");
    await handleGroupManager(sock, jid, senderNumber);
    return;
  }

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
  getNumberFromJid,
  cleanNumber,
  isLidJid,
  resolvePhoneFromMention,
};
