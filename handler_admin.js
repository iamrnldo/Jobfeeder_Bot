// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel + Edit Banner + Group Admin Manager
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
// groupAdminState: senderNumber → { step, action, groupJid, groupName, jid, timestamp }
// step: "select_group" | "select_member"
// action: "promote" | "demote"
const groupAdminState = new Map();

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

function ensureBannerDir() {
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
  }
}

// ==========================================
// FETCH JOINED GROUPS DARI WA
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      jid: g.id,
      name: g.subject || "Unknown Group",
      participants: g.participants || [],
    }));
  } catch (err) {
    console.error("❌ Gagal fetch group:", err.message);
    return [];
  }
}

// ==========================================
// FETCH METADATA 1 GROUP
// ==========================================
async function getGroupMetadata(sock, groupJid) {
  try {
    return await sock.groupMetadata(groupJid);
  } catch (err) {
    console.error(`❌ Gagal fetch metadata group ${groupJid}:`, err.message);
    return null;
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
// HANDLER: DEL ADMIN BOT (dari command)
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
// HANDLER: DEL ADMIN BOT (dari interactive list)
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
// EXECUTE DELETE ADMIN BOT
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
// KIRIM INTERACTIVE LIST UNTUK DELETE ADMIN BOT
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
// 🖼️ HANDLER: MULAI MODE EDIT BANNER
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
        console.log(`🔄 Banner di-restore dari backup: ${backupFiles[0]}`);
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
// ==========================================
// 👥 GROUP ADMIN MANAGER
// ==========================================
// ==========================================

// ==========================================
// STEP 1 — MENU GROUP MANAGER
// Tampilkan pilihan aksi: Promote / Demote / Lihat Admin
// Kemudian pilih group via list button
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `Kelola admin di dalam group WhatsApp.\n\n` +
      `📋 *Fitur:*\n` +
      `├ ⬆️ Promote member → admin group\n` +
      `├ ⬇️ Demote admin → member biasa\n` +
      `└ 👁️ Lihat daftar admin group\n\n` +
      `Pilih aksi di bawah 👇`,
    footer: `© ${config.botName} | Group Manager`,
    interactiveButtons: [
      {
        name: "cta_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "⬆️ Promote Member",
          id: "grpadmin_promote",
        }),
      },
      {
        name: "cta_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "⬇️ Demote Admin",
          id: "grpadmin_demote",
        }),
      },
      {
        name: "cta_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "👁️ Lihat Admin Group",
          id: "grpadmin_view",
        }),
      },
    ],
  });
}

// ==========================================
// STEP 2 — PILIH GROUP (untuk promote/demote/view)
// Fetch semua group yg diikuti bot → tampilkan via list button
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

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil daftar group...*`,
  });

  const joinedGroups = await getJoinedGroups(sock);

  if (joinedGroups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Tidak ada group ditemukan.*\n\n` +
        `Pastikan bot sudah bergabung ke group terlebih dahulu.`,
    });
    return;
  }

  // Simpan state — menunggu pilih group
  groupAdminState.set(senderNumber, {
    step: "select_group",
    action,
    jid,
    timestamp: Date.now(),
  });

  // ==========================================
  // Build sections (max 10 per section)
  // ==========================================
  const chunkSize = 10;
  const sections = [];

  for (let i = 0; i < joinedGroups.length; i += chunkSize) {
    const chunk = joinedGroups.slice(i, i + chunkSize);
    sections.push({
      title: `👥 Group (${i + 1}–${Math.min(i + chunkSize, joinedGroups.length)})`,
      rows: chunk.map((g) => {
        const adminCount = g.participants.filter(
          (p) => p.admin === "admin" || p.admin === "superadmin",
        ).length;
        const memberCount = g.participants.length;
        return {
          header: `${memberCount} anggota · ${adminCount} admin`,
          title: g.name.length > 24 ? g.name.substring(0, 24) + "…" : g.name,
          description: g.jid,
          id: `grpselect_${action}_${g.jid}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Bot bergabung di *${joinedGroups.length}* group.\n\n` +
      `Pilih group yang ingin dikelola 👇`,
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

  // Auto cancel state setelah 5 menit
  setTimeout(
    () => {
      const st = groupAdminState.get(senderNumber);
      if (st?.step === "select_group" && st?.action === action) {
        groupAdminState.delete(senderNumber);
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// STEP 3A — SETELAH PILIH GROUP → PROMOTE
// Tampilkan member (non-admin) via list button
// ==========================================
async function handleGroupSelectedForPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil daftar member group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nCoba lagi dengan ketik *group_manager*.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;

  // Filter: hanya member biasa (bukan admin/superadmin)
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada member untuk di-promote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Semua anggota sudah menjadi admin.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
    groupAdminState.delete(senderNumber);
    return;
  }

  // Update state
  groupAdminState.set(senderNumber, {
    step: "select_member",
    action: "promote",
    groupJid,
    groupName,
    jid,
    timestamp: Date.now(),
  });

  // Build sections member (max 10 per section)
  const chunkSize = 10;
  const sections = [];

  for (let i = 0; i < members.length; i += chunkSize) {
    const chunk = members.slice(i, i + chunkSize);
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + chunkSize, members.length)})`,
      rows: chunk.map((p) => {
        const number = getNumberFromJid(p.id);
        return {
          header: `⬆️ Promote`,
          title: `+${number}`,
          description: `Member biasa → jadikan admin group`,
          id: `grppromote_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  const adminCount = meta.participants.filter(
    (p) => p.admin === "admin" || p.admin === "superadmin",
  ).length;

  await sock.sendMessage(jid, {
    text:
      `⬆️ *PROMOTE MEMBER → ADMIN*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `👤 *Member:* ${members.length} orang\n` +
      `🛡️ *Admin saat ini:* ${adminCount} orang\n\n` +
      `Pilih member yang ingin di-promote 👇`,
    footer: `⚠️ Bot harus admin group untuk promote`,
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

  // Auto cancel state setelah 5 menit
  setTimeout(
    () => {
      const st = groupAdminState.get(senderNumber);
      if (st?.step === "select_member" && st?.action === "promote") {
        groupAdminState.delete(senderNumber);
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// STEP 3B — SETELAH PILIH GROUP → DEMOTE
// Tampilkan admin group via list button
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil daftar admin group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nCoba lagi dengan ketik *group_manager*.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;

  // Filter: hanya admin group (bukan superadmin / owner group)
  const admins = meta.participants.filter((p) => p.admin === "admin");

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner Group:*\n` +
          superAdmins.map((p) => `└ +${getNumberFromJid(p.id)}`).join("\n")
        : "";

    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada admin yang bisa di-demote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Owner group tidak bisa di-demote.` +
        superList +
        `\n\nKetik *group_manager* untuk kembali.`,
    });
    groupAdminState.delete(senderNumber);
    return;
  }

  // Update state
  groupAdminState.set(senderNumber, {
    step: "select_member",
    action: "demote",
    groupJid,
    groupName,
    jid,
    timestamp: Date.now(),
  });

  // Build sections admin (max 10 per section)
  const chunkSize = 10;
  const sections = [];

  for (let i = 0; i < admins.length; i += chunkSize) {
    const chunk = admins.slice(i, i + chunkSize);
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + chunkSize, admins.length)})`,
      rows: chunk.map((p) => {
        const number = getNumberFromJid(p.id);
        return {
          header: `⬇️ Demote`,
          title: `+${number}`,
          description: `Admin group → jadikan member biasa`,
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
      `👑 *Owner group:* ${superAdmins.length} orang (tidak bisa di-demote)\n\n` +
      `Pilih admin yang ingin di-demote 👇`,
    footer: `⚠️ Bot harus admin group untuk demote`,
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

  // Auto cancel state setelah 5 menit
  setTimeout(
    () => {
      const st = groupAdminState.get(senderNumber);
      if (st?.step === "select_member" && st?.action === "demote") {
        groupAdminState.delete(senderNumber);
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// STEP 3C — SETELAH PILIH GROUP → VIEW ADMIN
// Tampilkan daftar admin group (text)
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil daftar admin group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nCoba lagi dengan ketik *group_manager*.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const totalMembers = meta.participants.length;

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *ADMIN GROUP*        ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n\n`;

  // Owner / Superadmin
  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${getNumberFromJid(p.id)}\n`;
    });
  }

  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${getNumberFromJid(p.id)}\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, { text });

  groupAdminState.delete(senderNumber);
}

// ==========================================
// STEP 4A — EXECUTE PROMOTE
// Dipanggil setelah pilih member dari list
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = getNumberFromJid(targetJid);

  await sock.sendMessage(jid, {
    text: `⏳ *Mempromote +${targetNumber}...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");

    // Ambil nama group untuk konfirmasi
    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬆️ Promote berhasil: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *Member:* +${targetNumber}\n` +
        `🔄 *Status:* Member → 🛡️ Admin\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal promote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message.includes("not-authorized")) {
      errMsg = "Bot bukan admin group atau tidak punya izin.";
    } else if (err.message.includes("not-participant")) {
      errMsg = "User bukan anggota group ini.";
    }

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL PROMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `📋 *Pastikan:*\n` +
        `├ Bot adalah admin group\n` +
        `├ User masih anggota group\n` +
        `└ Bot tidak di-restrict oleh owner\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }

  groupAdminState.delete(senderNumber);
}

// ==========================================
// STEP 4B — EXECUTE DEMOTE
// Dipanggil setelah pilih admin dari list
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = getNumberFromJid(targetJid);

  await sock.sendMessage(jid, {
    text: `⏳ *Mendemote +${targetNumber}...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");

    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬇️ Demote berhasil: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *Admin:* +${targetNumber}\n` +
        `🔄 *Status:* 🛡️ Admin → Member\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal demote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message.includes("not-authorized")) {
      errMsg = "Bot bukan admin group atau tidak punya izin.";
    } else if (err.message.includes("not-participant")) {
      errMsg = "User bukan anggota group ini.";
    }

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL DEMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `📋 *Pastikan:*\n` +
        `├ Bot adalah admin group\n` +
        `├ Target masih admin group\n` +
        `└ Bot tidak di-restrict oleh owner\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }

  groupAdminState.delete(senderNumber);
}

// ==========================================
// ROUTER GROUP ADMIN — dari handler.js
// Parse ID dari list button → arahkan ke fungsi yg tepat
//
// Format ID:
// grpselect_{action}_{groupJid}     → pilih group
// grppromote_{groupJid}__{memberJid}→ execute promote
// grpdemote_{groupJid}__{memberJid} → execute demote
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminOrOwner(senderNumber)) return;

  // ==========================================
  // grpselect_promote_120363xxxxxx@g.us
  // grpselect_demote_120363xxxxxx@g.us
  // grpselect_view_120363xxxxxx@g.us
  // ==========================================
  if (rawId.startsWith("grpselect_")) {
    // Format: grpselect_{action}_{groupJid}
    // groupJid bisa mengandung @ dan titik — ambil semua setelah action
    const withoutPrefix = rawId.replace("grpselect_", ""); // "promote_120363xxx@g.us"
    const underscoreIdx = withoutPrefix.indexOf("_");
    if (underscoreIdx === -1) return;

    const action = withoutPrefix.substring(0, underscoreIdx); // "promote"
    const groupJid = withoutPrefix.substring(underscoreIdx + 1); // "120363xxx@g.us"

    if (action === "promote") {
      await handleGroupSelectedForPromote(sock, jid, senderNumber, groupJid);
    } else if (action === "demote") {
      await handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid);
    } else if (action === "view") {
      await handleGroupViewAdmins(sock, jid, senderNumber, groupJid);
    }
    return;
  }

  // ==========================================
  // grppromote_{groupJid}__{memberJid}
  // Pemisah: __ (double underscore)
  // ==========================================
  if (rawId.startsWith("grppromote_")) {
    const withoutPrefix = rawId.replace("grppromote_", "");
    const sepIdx = withoutPrefix.indexOf("__");
    if (sepIdx === -1) return;

    const groupJid = withoutPrefix.substring(0, sepIdx);
    const targetJid = withoutPrefix.substring(sepIdx + 2);

    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  // ==========================================
  // grpdemote_{groupJid}__{memberJid}
  // ==========================================
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
  // Bot admin handlers
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,

  // Banner handlers
  handleEditBanner,
  handleIncomingImage,

  // Group admin manager
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,

  // Send UI
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,

  // Utilities
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  normalizeNumber,
  getNumberFromJid,
};
