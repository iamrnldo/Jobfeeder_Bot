// ==========================================
//  HANDLER_ADMIN.JS
//  Khusus: Admin Bot Panel
//
//  Hak Akses Admin Bot:
//  ✅ Lihat daftar admin bot
//  ✅ Tambah admin bot (sesama admin, TIDAK bisa tambah owner)
//  ✅ Hapus admin bot (sesama admin, TIDAK bisa hapus owner)
//  ✅ Edit banner menu
//  ✅ Lihat daftar pesanan
//  ❌ Tidak bisa akses group manager
//  ❌ Tidak bisa tambah/hapus owner
// ==========================================

const fs = require("fs");
const path = require("path");
const {
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdminBot,
  isAdminOrOwner,
  normalizeNumber,
  jidToDigits,
  getNumberFromJid,
  cleanNumber,
} = require("./handler_owner");

const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");
const BANNER_DIR = path.join(__dirname, "images", "menu");

// ==========================================
// STATE MAPS
// ==========================================
const bannerEditState = new Map();

function ensureBannerDir() {
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
  }
}

// ==========================================
// ADMIN BOT PANEL MENU
// ==========================================
function getAdminBotMenuSection(senderNumber) {
  const bannerExists = fs.existsSync(BANNER_PATH);
  const admins = loadAdmins().filter((a) => !isOwner(a));

  return {
    title: "🛡️ Panel Admin Bot",
    highlight_label: "Admin Only",
    rows: [
      {
        header: "📋",
        title: "Daftar Admin Bot",
        description: "Lihat semua admin bot terdaftar",
        id: "adminbot_list",
      },
      {
        header: "➕",
        title: "Tambah Admin Bot",
        description: "Tambah admin bot baru (sesama admin)",
        id: "adminbot_add",
      },
      {
        header: "➖",
        title: "Hapus Admin Bot",
        description: `Hapus admin sesama (${admins.length} admin)`,
        id: "adminbot_del",
      },
      {
        header: "📦",
        title: "Daftar Pesanan",
        description: "Lihat semua order masuk",
        id: "adminbot_orders",
      },
      {
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner (sudah ada)"
          : "Upload banner (belum ada)",
        id: "adminbot_banner",
      },
    ],
  };
}

// ==========================================
// ADMIN BOT: LIHAT DAFTAR ADMIN
// ==========================================
async function handleAdminBotList(sock, jid, senderNumber) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const config = require("./config");
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
      const isSelf = normalizeNumber(a) === normalizeNumber(senderNumber);
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${a}${isSelf ? " _(kamu)_" : ""}\n`;
    });
  }

  text += `\n📊 Total: ${admins.length + 1} (termasuk owner)`;
  await sock.sendMessage(jid, { text });
}

// ==========================================
// ADMIN BOT: TAMBAH ADMIN BOT
// Admin hanya bisa tambah sesama admin
// TIDAK bisa tambah owner
// ==========================================
async function handleAdminBotAdd(sock, msg, jid, senderNumber, rawText) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
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

  // ✅ Admin TIDAK bisa tambah owner sebagai admin
  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: `👑 *+${target}* adalah Owner.\n\nOwner tidak perlu ditambah sebagai admin.`,
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
  console.log(`✅ [ADMIN] Admin ditambahkan: +${target} oleh +${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN BOT DITAMBAHKAN*\n\n` +
      `📱 Nomor: +${target}\n` +
      `👤 Ditambahkan oleh: +${senderNumber}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN BOT: HAPUS ADMIN BOT (command)
// Admin hanya bisa hapus sesama admin
// TIDAK bisa hapus owner
// ==========================================
async function handleAdminBotDel(sock, jid, senderNumber, rawText) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
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

  await executeAdminBotDelete(sock, jid, senderNumber, target);
}

// ==========================================
// ADMIN BOT: HAPUS ADMIN BOT (dari list)
// ==========================================
async function handleAdminBotDelFromList(sock, jid, senderNumber, rawId) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const target = rawId.replace("adminbot_deladmin_", "");
  await executeAdminBotDelete(sock, jid, senderNumber, target);
}

// ==========================================
// EXECUTE: HAPUS ADMIN BOT
// ==========================================
async function executeAdminBotDelete(sock, jid, senderNumber, target) {
  // ✅ Admin TIDAK bisa hapus owner
  if (isOwner(target)) {
    await sock.sendMessage(jid, {
      text: `⛔ *TIDAK BISA MENGHAPUS OWNER*\n\nHanya Owner yang bisa mengelola dirinya sendiri.`,
    });
    return;
  }

  if (!isAdminBot(target)) {
    await sock.sendMessage(jid, {
      text: `❌ *+${target}* bukan admin bot.`,
    });
    return;
  }

  // ✅ Admin tidak bisa hapus diri sendiri
  if (normalizeNumber(senderNumber) === normalizeNumber(target)) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak bisa menghapus diri sendiri.\n\nMinta Owner untuk menghapus kamu.`,
    });
    return;
  }

  const admins = loadAdmins().filter(
    (a) => normalizeNumber(a) !== normalizeNumber(target),
  );
  saveAdmins(admins);
  console.log(`🗑️ [ADMIN] Admin dihapus: +${target} oleh +${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN BOT DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `👤 Dihapus oleh: +${senderNumber}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN BOT: LIST HAPUS ADMIN (pilihan)
// Hanya tampilkan sesama admin
// TIDAK tampilkan owner
// ==========================================
async function handleAdminBotDelList(sock, jid, senderNumber) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  // ✅ Hanya tampilkan admin lain (bukan owner, bukan diri sendiri)
  const admins = loadAdmins().filter((a) => {
    if (isOwner(a)) return false; // skip owner
    if (normalizeNumber(a) === normalizeNumber(senderNumber)) return false; // skip diri sendiri
    return true;
  });

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `📋 *HAPUS ADMIN BOT*\n\n` +
        `_Tidak ada admin lain yang bisa dihapus._\n\n` +
        `Note: Kamu tidak bisa menghapus diri sendiri atau Owner.`,
    });
    return;
  }

  const rows = admins.map((a, i) => ({
    header: `Admin #${i + 1}`,
    title: `+${a}`,
    description: `Hapus +${a} dari daftar admin`,
    id: `adminbot_deladmin_${a}`,
  }));

  await sock.sendMessage(jid, {
    text:
      `🗑️ *HAPUS ADMIN BOT*\n\n` +
      `Pilih admin yang ingin dihapus.\n` +
      `Total tersedia: *${admins.length}*\n\n` +
      `⚠️ Owner dan diri sendiri tidak bisa dihapus.`,
    footer: "Admin Bot Panel",
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
// ADMIN BOT: DAFTAR PESANAN
// ==========================================
async function handleAdminBotOrders(sock, jid, senderNumber) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
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
// EDIT BANNER (bisa diakses admin bot, owner, admin group)
// ==========================================
async function handleEditBanner(sock, jid, senderNumber) {
  // Siapapun yang punya akses (dicek di handler.js sebelum dipanggil)
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
      `📤 *Kirim gambar baru untuk mengganti banner.*\n\n` +
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

  console.log(`🖼️ Gambar banner dari +${senderNumber}...`);
  bannerEditState.delete(senderNumber);

  await sock.sendMessage(jid, { text: `⏳ *Menyimpan banner baru...*` });

  try {
    const { downloadMediaMessage } = require("atexovi-baileys");
    ensureBannerDir();

    if (fs.existsSync(BANNER_PATH)) {
      const backupName = `banner_menu_backup_${Date.now()}.jpg`;
      fs.copyFileSync(BANNER_PATH, path.join(BANNER_DIR, backupName));
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
    console.log(`✅ Banner tersimpan: ${sizeKB} KB oleh +${senderNumber}`);

    await sock.sendMessage(jid, {
      image: buffer,
      caption:
        `✅ *BANNER DIPERBARUI!*\n\n` +
        `📁 Ukuran: ${sizeKB} KB\n` +
        `🕐 ${new Date().toLocaleString("id-ID")}\n` +
        `👤 Oleh: +${senderNumber}`,
    });

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
      }
    } catch (e) {}

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL UPDATE BANNER*\n\n` +
        `Error: ${err.message}\n\n` +
        `Ketik *edit_banner* untuk coba lagi.`,
    });
  }
}

// ==========================================
// ADMIN BOT ROUTER
// ==========================================
async function handleAdminBotRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) return;

  if (rawId === "adminbot_list") {
    await handleAdminBotList(sock, jid, senderNumber);
    return;
  }

  if (rawId === "adminbot_add") {
    await sock.sendMessage(jid, {
      text:
        `➕ *TAMBAH ADMIN BOT*\n\n` +
        `Kirim nomor admin baru:\n` +
        `\`\`\`/addadmin 628xxxxxxxxxx\`\`\`\n\n` +
        `⚠️ Tidak bisa menambah Owner sebagai admin.`,
    });
    return;
  }

  if (rawId === "adminbot_del") {
    await handleAdminBotDelList(sock, jid, senderNumber);
    return;
  }

  if (rawId.startsWith("adminbot_deladmin_")) {
    await handleAdminBotDelFromList(sock, jid, senderNumber, rawId);
    return;
  }

  if (rawId === "adminbot_orders") {
    await handleAdminBotOrders(sock, jid, senderNumber);
    return;
  }

  if (rawId === "adminbot_banner") {
    await handleEditBanner(sock, jid, senderNumber);
    return;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Panel
  getAdminBotMenuSection,
  handleAdminBotRouter,

  // Handlers
  handleAdminBotList,
  handleAdminBotAdd,
  handleAdminBotDel,
  handleAdminBotDelFromList,
  handleAdminBotOrders,

  // Banner (shared — bisa dipanggil dari handler lain)
  handleEditBanner,
  handleIncomingImage,
  bannerEditState,
};
