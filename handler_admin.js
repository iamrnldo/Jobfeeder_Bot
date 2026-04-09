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
// HELPERS UMUM
// ==========================================
function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

function getNumberFromJid(jid) {
  // Handles: 628xxx@s.whatsapp.net, 628xxx:12@s.whatsapp.net
  return jid.split("@")[0].split(":")[0];
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
// HELPERS: BOT NUMBER
// Ambil nomor bot dari sock.user.id
// Format bisa: 628xxx:12@s.whatsapp.net
//           atau 628xxx@s.whatsapp.net
// ==========================================
function getBotNumber(sock) {
  const id = sock.user?.id || "";
  return id.split("@")[0].split(":")[0];
}

// Cek apakah participant JID cocok dengan bot
function isParticipantBot(participantJid, botNumber) {
  const pNumber = participantJid.split("@")[0].split(":")[0];
  return pNumber === botNumber;
}

// ==========================================
// HELPERS: GROUP
// ==========================================

// Cek apakah bot adalah admin di group (fresh data)
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const botNumber = getBotNumber(sock);

    console.log(`🔍 isBotAdmin - botNumber: ${botNumber}, group: ${groupJid}`);

    const botParticipant = meta.participants.find((p) =>
      isParticipantBot(p.id, botNumber),
    );

    console.log(`🔍 botParticipant: ${JSON.stringify(botParticipant || null)}`);

    return (
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin"
    );
  } catch (err) {
    console.error("❌ Gagal cek bot admin:", err.message);
    return false;
  }
}

// Fetch metadata 1 group (fresh)
async function getGroupMetadata(sock, groupJid) {
  try {
    return await sock.groupMetadata(groupJid);
  } catch (err) {
    console.error(`❌ Gagal fetch metadata group ${groupJid}:`, err.message);
    return null;
  }
}

// Fetch semua group yang diikuti bot (fresh metadata per group)
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    const result = [];
    for (const g of groupList) {
      try {
        // Fetch fresh metadata agar data admin/member akurat
        const freshMeta = await sock.groupMetadata(g.id);
        result.push({
          jid: freshMeta.id,
          name: freshMeta.subject || "Unknown Group",
          participants: freshMeta.participants || [],
        });
      } catch (e) {
        // Fallback ke cache jika fetch fresh gagal
        console.warn(`⚠️ Fallback cache untuk group ${g.id}: ${e.message}`);
        result.push({
          jid: g.id,
          name: g.subject || "Unknown Group",
          participants: g.participants || [],
        });
      }
    }

    return result;
  } catch (err) {
    console.error("❌ Gagal fetch group:", err.message);
    return [];
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
// KIRIM LIST DELETE ADMIN BOT
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

  // Auto cancel 5 menit
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
// 🖼️ HANDLER: PROSES GAMBAR MASUK (edit banner)
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

    // Backup banner lama
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

    // Restore backup
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
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data group...*` });

  const joinedGroups = await getJoinedGroups(sock);
  const botNumber = getBotNumber(sock);

  console.log(`🤖 Bot number: ${botNumber}`);

  let adminGroups = 0;
  let nonAdminGroups = 0;

  for (const g of joinedGroups) {
    const botParticipant = g.participants.find((p) =>
      isParticipantBot(p.id, botNumber),
    );
    const botIsAdmin =
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin";
    if (botIsAdmin) adminGroups++;
    else nonAdminGroups++;
  }

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status Bot di Group:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot sebagai admin: ${adminGroups} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminGroups} group\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Cara penggunaan:*\n` +
      `├ ⬆️ *Promote* → jadikan member jadi admin\n` +
      `├ ⬇️ *Demote* → turunkan admin jadi member\n` +
      `├ 👁️ *Lihat Admin* → cek daftar admin group\n` +
      `└ 💬 Command di group: \`/promote @user\` · \`/demote @user\`\n\n` +
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
// STEP 2 — PILIH GROUP
// Pisahkan: bot sudah admin vs belum admin
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
      text:
        `❌ *Tidak ada group ditemukan.*\n\n` +
        `Pastikan bot sudah bergabung ke group.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
    return;
  }

  const botNumber = getBotNumber(sock);
  console.log(`🤖 Bot number (selectAction): ${botNumber}`);

  const adminGroupRows = [];
  const nonAdminGroupRows = [];

  for (const g of joinedGroups) {
    const botParticipant = g.participants.find((p) =>
      isParticipantBot(p.id, botNumber),
    );
    const botIsAdmin =
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin";

    const adminCount = g.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    ).length;
    const memberCount = g.participants.length;

    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;

    console.log(
      `👥 ${g.name} | bot: ${botParticipant?.admin || "not found"} | isAdmin: ${botIsAdmin}`,
    );

    if (botIsAdmin) {
      adminGroupRows.push({
        header: `✅ ${memberCount} anggota · ${adminCount} admin`,
        title: shortName,
        description: `Bot admin · ${g.jid}`,
        id: `grpselect_${action}_${g.jid}`,
      });
    } else {
      nonAdminGroupRows.push({
        header: `⚠️ ${memberCount} anggota · Bot bukan admin`,
        title: shortName,
        description:
          action === "view"
            ? `Lihat saja · ${g.jid}`
            : `⚠️ Promote bot jadi admin dulu`,
        id:
          action === "view"
            ? `grpselect_view_${g.jid}`
            : `grpnotadmin_${g.jid}`,
      });
    }
  }

  // Build sections (max 10 per section)
  const sections = [];

  if (adminGroupRows.length > 0) {
    for (let i = 0; i < adminGroupRows.length; i += 10) {
      sections.push({
        title:
          adminGroupRows.length > 10
            ? `✅ Bot Admin (${i + 1}–${Math.min(i + 10, adminGroupRows.length)})`
            : `✅ Bot Sudah Admin (${adminGroupRows.length})`,
        rows: adminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (nonAdminGroupRows.length > 0) {
    for (let i = 0; i < nonAdminGroupRows.length; i += 10) {
      sections.push({
        title:
          nonAdminGroupRows.length > 10
            ? `⚠️ Bot Bukan Admin (${i + 1}–${Math.min(i + 10, nonAdminGroupRows.length)})`
            : `⚠️ Bot Bukan Admin (${nonAdminGroupRows.length})`,
        rows: nonAdminGroupRows.slice(i, i + 10),
      });
    }
  }

  // Jika tidak ada sections sama sekali
  if (sections.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak ada group tersedia.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Bot bergabung di *${joinedGroups.length}* group:\n` +
      `├ ✅ Bot admin: *${adminGroupRows.length}* group\n` +
      `└ ⚠️ Bot bukan admin: *${nonAdminGroupRows.length}* group\n\n` +
      `_Group ⚠️ perlu promote bot jadi admin dulu_\n\n` +
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
// PERINGATAN: Bot bukan admin group
// ==========================================
async function handleBotNotAdmin(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  let groupName = groupJid;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupName = meta?.subject || groupJid;
  } catch (e) {}

  const botNumber = getBotNumber(sock);

  await sock.sendMessage(jid, {
    text:
      `⚠️ *BOT BUKAN ADMIN GROUP*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `🤖 *Bot:* +${botNumber}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `❌ Bot tidak bisa promote/demote karena *bukan admin* di group ini.\n\n` +
      `✅ *Cara jadikan bot sebagai admin:*\n` +
      `1️⃣ Buka group *${groupName}*\n` +
      `2️⃣ Tap nama group → *Info Group*\n` +
      `3️⃣ Tap *+${botNumber}*\n` +
      `4️⃣ Pilih *Jadikan Admin*\n\n` +
      `Setelah bot menjadi admin, ketik *group_manager* lagi.`,
  });
}

// ==========================================
// STEP 3A — GROUP DIPILIH → PROMOTE
// Tampilkan member (non-admin) via list
// ==========================================
async function handleGroupSelectedForPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil data member group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botNumber = getBotNumber(sock);

  console.log(`🔍 Promote - botNumber: ${botNumber}`);
  console.log(
    `🔍 Participants:`,
    meta.participants.map((p) => ({
      id: p.id,
      parsed: p.id.split("@")[0].split(":")[0],
      admin: p.admin,
    })),
  );

  const botParticipant = meta.participants.find((p) =>
    isParticipantBot(p.id, botNumber),
  );
  const botIsAdmin =
    botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";

  console.log(
    `🔍 botParticipant: ${JSON.stringify(botParticipant)} | isAdmin: ${botIsAdmin}`,
  );

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Filter member biasa (non-admin)
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada member untuk di-promote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Semua anggota sudah admin.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
    return;
  }

  const adminCount = meta.participants.filter(
    (p) => p.admin === "admin" || p.admin === "superadmin",
  ).length;

  // Build sections (max 10 per section)
  const sections = [];
  for (let i = 0; i < members.length; i += 10) {
    const chunk = members.slice(i, i + 10);
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + 10, members.length)})`,
      rows: chunk.map((p) => {
        const number = p.id.split("@")[0].split(":")[0];
        return {
          header: `⬆️ Promote ke Admin`,
          title: `+${number}`,
          description: `Jadikan +${number} admin group`,
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
      `💬 Atau gunakan command di group:\n` +
      `\`\`\`/promote @user\`\`\`\n\n` +
      `Pilih member yang ingin di-promote 👇`,
    footer: `✅ Bot sudah admin di group ini`,
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
// STEP 3B — GROUP DIPILIH → DEMOTE
// Tampilkan admin group via list
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil data admin group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botNumber = getBotNumber(sock);

  const botParticipant = meta.participants.find((p) =>
    isParticipantBot(p.id, botNumber),
  );
  const botIsAdmin =
    botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Hanya admin biasa (bukan superadmin/owner group)
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner Group (tidak bisa di-demote):*\n` +
          superAdmins
            .map((p) => `└ +${p.id.split("@")[0].split(":")[0]}`)
            .join("\n")
        : "";
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada admin yang bisa di-demote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Owner group tidak bisa di-demote.` +
        superList +
        `\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  // Build sections (max 10 per section)
  const sections = [];
  for (let i = 0; i < admins.length; i += 10) {
    const chunk = admins.slice(i, i + 10);
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + 10, admins.length)})`,
      rows: chunk.map((p) => {
        const number = p.id.split("@")[0].split(":")[0];
        return {
          header: `⬇️ Demote ke Member`,
          title: `+${number}`,
          description: `Turunkan +${number} jadi member biasa`,
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
      `💬 Atau gunakan command di group:\n` +
      `\`\`\`/demote @user\`\`\`\n\n` +
      `Pilih admin yang ingin di-demote 👇`,
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
// STEP 3C — GROUP DIPILIH → VIEW ADMIN
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, {
    text: `⏳ *Mengambil daftar admin group...*`,
  });

  const meta = await getGroupMetadata(sock, groupJid);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;
  const totalMembers = meta.participants.length;
  const botNumber = getBotNumber(sock);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  const botParticipant = meta.participants.find((p) =>
    isParticipantBot(p.id, botNumber),
  );
  const botIsAdmin =
    botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *INFO ADMIN GROUP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Owner Group
  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const number = p.id.split("@")[0].split(":")[0];
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${number === botNumber ? " 🤖" : ""}\n`;
    });
  }

  // Admin Group
  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const number = p.id.split("@")[0].split(":")[0];
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${number === botNumber ? " 🤖" : ""}\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// EXECUTE: PROMOTE via list button
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = targetJid.split("@")[0].split(":")[0];

  await sock.sendMessage(jid, {
    text: `⏳ *Mempromote +${targetNumber}...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");
    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬆️ Promote: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 *Status:* Member → 🛡️ Admin\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal promote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message?.includes("not-authorized"))
      errMsg = "Bot bukan admin group.";
    if (err.message?.includes("not-participant"))
      errMsg = "User bukan anggota group.";

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL PROMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }
}

// ==========================================
// EXECUTE: DEMOTE via list button
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = targetJid.split("@")[0].split(":")[0];

  await sock.sendMessage(jid, {
    text: `⏳ *Mendemote +${targetNumber}...*`,
  });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");
    const meta = await getGroupMetadata(sock, groupJid);
    const groupName = meta?.subject || groupJid;

    console.log(
      `⬇️ Demote: +${targetNumber} di ${groupName} oleh ${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 *Status:* 🛡️ Admin → Member\n` +
        `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n` +
        `👤 *Oleh:* ${senderNumber}\n\n` +
        `Ketik *group_manager* untuk kelola lebih lanjut.`,
    });
  } catch (err) {
    console.error(`❌ Gagal demote ${targetNumber}:`, err.message);

    let errMsg = err.message;
    if (err.message?.includes("not-authorized"))
      errMsg = "Bot bukan admin group.";
    if (err.message?.includes("not-participant"))
      errMsg = "User bukan anggota group.";

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL DEMOTE*\n\n` +
        `👤 Target: +${targetNumber}\n` +
        `📛 Error: ${errMsg}\n\n` +
        `Ketik *group_manager* untuk kembali.`,
    });
  }
}

// ==========================================
// PROMOTE via command /promote @user (di group)
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Command ini hanya bisa digunakan di dalam *group*.`,
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
      text:
        `⚠️ *Bot bukan admin group ini.*\n\n` +
        `Jadikan bot sebagai admin group terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/promote @user\`\n` +
        `Contoh: /promote @628xxxxxxxxxx`,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const targetNumber = targetJid.split("@")[0].split(":")[0];
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "promote");
      results.push(`✅ +${targetNumber} → 🛡️ Admin`);
      console.log(`⬆️ Promote (cmd): +${targetNumber} oleh ${senderNumber}`);
    } catch (err) {
      let errMsg = "Gagal";
      if (err.message?.includes("not-authorized")) errMsg = "Bot bukan admin";
      if (err.message?.includes("not-participant")) errMsg = "Bukan anggota";
      results.push(`❌ +${targetNumber} → ${errMsg}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬆️ *HASIL PROMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
    },
    { quoted: msg },
  );
}

// ==========================================
// DEMOTE via command /demote @user (di group)
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Command ini hanya bisa digunakan di dalam *group*.`,
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
      text:
        `⚠️ *Bot bukan admin group ini.*\n\n` +
        `Jadikan bot sebagai admin group terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Format salah.*\n\n` +
        `Gunakan: \`/demote @user\`\n` +
        `Contoh: /demote @628xxxxxxxxxx`,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const targetNumber = targetJid.split("@")[0].split(":")[0];
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "demote");
      results.push(`✅ +${targetNumber} → 👤 Member`);
      console.log(`⬇️ Demote (cmd): +${targetNumber} oleh ${senderNumber}`);
    } catch (err) {
      let errMsg = "Gagal";
      if (err.message?.includes("not-authorized")) errMsg = "Bot bukan admin";
      if (err.message?.includes("not-participant")) errMsg = "Bukan anggota";
      results.push(`❌ +${targetNumber} → ${errMsg}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `⬇️ *HASIL DEMOTE*\n\n` +
        results.join("\n") +
        `\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
    },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN — dari handler.js
// Parse ID dari list button:
//   grpnotadmin_{groupJid}
//   grpselect_{action}_{groupJid}
//   grppromote_{groupJid}__{memberJid}
//   grpdemote_{groupJid}__{memberJid}
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminOrOwner(senderNumber)) return;

  // ── grpnotadmin_{groupJid} ──────────────
  if (rawId.startsWith("grpnotadmin_")) {
    const groupJid = rawId.replace("grpnotadmin_", "");
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // ── grpselect_{action}_{groupJid} ───────
  if (rawId.startsWith("grpselect_")) {
    const withoutPrefix = rawId.replace("grpselect_", "");
    const underscoreIdx = withoutPrefix.indexOf("_");
    if (underscoreIdx === -1) return;

    const action = withoutPrefix.substring(0, underscoreIdx);
    const groupJid = withoutPrefix.substring(underscoreIdx + 1);

    if (action === "promote") {
      await handleGroupSelectedForPromote(sock, jid, senderNumber, groupJid);
    } else if (action === "demote") {
      await handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid);
    } else if (action === "view") {
      await handleGroupViewAdmins(sock, jid, senderNumber, groupJid);
    }
    return;
  }

  // ── grppromote_{groupJid}__{memberJid} ──
  if (rawId.startsWith("grppromote_")) {
    const withoutPrefix = rawId.replace("grppromote_", "");
    const sepIdx = withoutPrefix.indexOf("__");
    if (sepIdx === -1) return;

    const groupJid = withoutPrefix.substring(0, sepIdx);
    const targetJid = withoutPrefix.substring(sepIdx + 2);
    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  // ── grpdemote_{groupJid}__{memberJid} ───
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

  // Command /promote /demote (di group)
  handlePromoteCommand,
  handleDemoteCommand,

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
