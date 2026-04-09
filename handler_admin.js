// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel + Edit Banner Menu
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
// STATE: Mode edit banner
// Key: senderNumber → { waiting, jid, timestamp }
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
// ENSURE BANNER DIR EXISTS
// ==========================================
function ensureBannerDir() {
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
    console.log(`📁 Direktori banner dibuat: ${BANNER_DIR}`);
  }
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
// 🖼️ HANDLER: MULAI MODE EDIT BANNER
// ==========================================
async function handleEditBanner(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  // Pastikan direktori ada
  ensureBannerDir();

  // Set state menunggu gambar dari sender ini
  bannerEditState.set(senderNumber, {
    waiting: true,
    jid,
    timestamp: Date.now(),
  });

  // ==========================================
  // Info banner saat ini
  // ==========================================
  const bannerExists = fs.existsSync(BANNER_PATH);
  let bannerInfo = "";

  if (bannerExists) {
    const stat = fs.statSync(BANNER_PATH);
    const sizeKB = (stat.size / 1024).toFixed(1);
    const modified = new Date(stat.mtime).toLocaleString("id-ID");
    bannerInfo =
      `📊 *Banner Saat Ini:*\n` +
      `├ 📁 Ukuran: ${sizeKB} KB\n` +
      `└ 🕐 Diubah: ${modified}\n\n`;
  } else {
    bannerInfo = `⚠️ _Banner belum ada_\n\n`;
  }

  // ==========================================
  // Kirim instruksi
  // ==========================================
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

  // ==========================================
  // Kirim preview banner lama (jika ada)
  // ==========================================
  if (bannerExists) {
    try {
      const bannerBuffer = fs.readFileSync(BANNER_PATH);
      await sock.sendMessage(jid, {
        image: bannerBuffer,
        caption:
          `📌 *Preview Banner Saat Ini*\n\n` +
          `Kirim gambar baru untuk mengganti banner ini.`,
      });
    } catch (err) {
      console.error(`⚠️ Gagal kirim preview banner: ${err.message}`);
    }
  }

  // ==========================================
  // Auto-cancel setelah 5 menit
  // ==========================================
  setTimeout(
    () => {
      const state = bannerEditState.get(senderNumber);
      if (state?.waiting) {
        bannerEditState.delete(senderNumber);
        console.log(`⏰ Mode edit banner timeout untuk ${senderNumber}`);
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
// Dipanggil dari handler.js untuk setiap pesan non-text
// ==========================================
async function handleIncomingImage(sock, msg, jid, senderNumber) {
  // ==========================================
  // Cek apakah sender sedang dalam mode edit banner
  // ==========================================
  const state = bannerEditState.get(senderNumber);
  if (!state?.waiting) return;

  const m = msg.message;
  if (!m) return;

  // ==========================================
  // CEK COMMAND BATAL
  // Bisa dari text biasa atau caption gambar
  // ==========================================
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

  // ==========================================
  // CEK APAKAH PESAN BERISI GAMBAR
  // ==========================================
  const imageMsg = m.imageMessage;
  if (!imageMsg) {
    // Bukan gambar — beri petunjuk
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Kirim gambar (bukan teks)* untuk mengganti banner.\n\n` +
        `❌ Ketik *batal* untuk membatalkan.`,
    });
    return;
  }

  // ==========================================
  // ADA GAMBAR — PROSES
  // ==========================================
  console.log(`🖼️ Menerima gambar banner dari ${senderNumber}, memproses...`);

  // Hapus state — cegah double process
  bannerEditState.delete(senderNumber);

  // Notif processing
  await sock.sendMessage(jid, {
    text: `⏳ *Memproses dan menyimpan banner baru...*`,
  });

  try {
    // ==========================================
    // DOWNLOAD GAMBAR DARI PESAN WA
    // ==========================================
    const { downloadMediaMessage } = require("atexovi-baileys");

    ensureBannerDir();

    // Backup banner lama jika ada
    if (fs.existsSync(BANNER_PATH)) {
      const backupName = `banner_menu_backup_${Date.now()}.jpg`;
      const backupPath = path.join(BANNER_DIR, backupName);
      fs.copyFileSync(BANNER_PATH, backupPath);
      console.log(`💾 Banner lama di-backup: ${backupName}`);
    }

    // Download buffer dari pesan
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

    // ==========================================
    // VALIDASI BUFFER
    // ==========================================
    if (!buffer || buffer.length === 0) {
      throw new Error("Buffer gambar kosong, coba kirim ulang.");
    }

    // Validasi ukuran max 5 MB
    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new Error(
        `Ukuran gambar terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB\n` +
          `Maksimal 5 MB.`,
      );
    }

    // ==========================================
    // SIMPAN SEBAGAI banner_menu.jpg
    // ==========================================
    fs.writeFileSync(BANNER_PATH, buffer);

    const sizeKB = (buffer.length / 1024).toFixed(1);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);

    console.log(
      `✅ Banner baru disimpan: ${BANNER_PATH} | ${sizeKB} KB | oleh ${senderNumber}`,
    );

    // ==========================================
    // KIRIM KONFIRMASI + PREVIEW BANNER BARU
    // ==========================================
    await sock.sendMessage(jid, {
      image: buffer,
      caption:
        `✅ *BANNER BERHASIL DIPERBARUI!*\n\n` +
        `📁 Ukuran: ${sizeKB} KB (${sizeMB} MB)\n` +
        `🕐 Diperbarui: ${new Date().toLocaleString("id-ID")}\n` +
        `👤 Oleh: ${senderNumber}\n\n` +
        `_Banner akan tampil ketika user ketik *menu* atau *help*_ ✅`,
    });
  } catch (err) {
    console.error(`❌ Gagal simpan banner: ${err.message}`);

    // ==========================================
    // RESTORE BACKUP jika gagal
    // ==========================================
    try {
      const backupFiles = fs
        .readdirSync(BANNER_DIR)
        .filter((f) => f.startsWith("banner_menu_backup_"))
        .sort()
        .reverse();

      if (backupFiles.length > 0) {
        const latestBackup = path.join(BANNER_DIR, backupFiles[0]);
        fs.copyFileSync(latestBackup, BANNER_PATH);
        console.log(`🔄 Banner di-restore dari backup: ${backupFiles[0]}`);
      }
    } catch (restoreErr) {
      console.error(`⚠️ Gagal restore backup: ${restoreErr.message}`);
    }

    // Kirim pesan error
    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMPERBARUI BANNER*\n\n` +
        `📛 Error: ${err.message}\n\n` +
        `📋 *Pastikan:*\n` +
        `├ Gambar dalam format JPG atau PNG\n` +
        `├ Ukuran tidak lebih dari 5 MB\n` +
        `└ Koneksi internet stabil\n\n` +
        `🔄 Ketik *edit_banner* untuk mencoba lagi.`,
    });
    return;
  }

  // ==========================================
  // BERSIHKAN BACKUP LAMA (simpan max 3)
  // ==========================================
  try {
    const backupFiles = fs
      .readdirSync(BANNER_DIR)
      .filter((f) => f.startsWith("banner_menu_backup_"))
      .sort()
      .reverse();

    if (backupFiles.length > 3) {
      for (let i = 3; i < backupFiles.length; i++) {
        const oldBackup = path.join(BANNER_DIR, backupFiles[i]);
        fs.unlinkSync(oldBackup);
        console.log(`🗑️ Backup lama dihapus: ${backupFiles[i]}`);
      }
    }
  } catch (cleanErr) {
    console.error(`⚠️ Gagal bersihkan backup lama: ${cleanErr.message}`);
  }
}

// ==========================================
// KIRIM SECTION ADMIN PANEL (untuk menu utama)
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
        description: "Tambah admin baru",
        id: "admin_add",
      },
      {
        header: "➖",
        title: "Hapus Admin",
        description: `Hapus admin (${admins.length} terdaftar)`,
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
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner menu (ada)"
          : "Upload banner menu (belum ada)",
        id: "admin_banner",
      },
    ],
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Admin handlers
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,

  // Banner handlers
  handleEditBanner,
  handleIncomingImage,

  // Send UI
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,

  // Utilities (dipakai file lain)
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  normalizeNumber,
  getNumberFromJid,
};
