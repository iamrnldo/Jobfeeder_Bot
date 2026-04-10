// ==========================================
//  HANDLER_ADMIN.JS - Admin Bot Panel
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
} = require("./handler_owner");
const { resolveMentionToPhone, isLidJid } = require("./lid_resolver");

const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");
const BANNER_DIR = path.join(__dirname, "images", "menu");

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
        header: "📢",
        title: "Broadcast Group",
        description: "Kirim announce ke beberapa group",
        id: "announce_start",
      },
      {
        header: "📋",
        title: "Daftar Admin Bot",
        description: "Lihat semua admin bot",
        id: "adminbot_list",
      },
      {
        header: "➕",
        title: "Tambah Admin Bot",
        description: `Tambah admin bot baru (${admins.length} terdaftar)`,
        id: "adminbot_add",
      },
      {
        header: "➖",
        title: "Hapus Admin Bot",
        description: `Hapus admin sesama`,
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
        description: bannerExists ? "Ganti banner" : "Upload banner",
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
// ADMIN BOT: TAMBAH ADMIN BOT (Support Mention & LID)
// ==========================================
async function handleAdminBotAdd(sock, msg, jid, senderNumber, rawText) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const groupJid = jid.endsWith("@g.us") ? jid : null;

  let target = "";
  let sourceInfo = "";
  let resolvedFromLid = false;

  // Prioritas 1: Nomor langsung
  const parts = rawText.trim().split(/\s+/);
  if (parts.length >= 2 && !parts[1].startsWith("@")) {
    target = normalizeNumber(parts[1]);
    sourceInfo = "nomor langsung";
  }

  // Prioritas 2: Mention
  if (!target && mentions.length > 0) {
    const mentionJid = mentions[0];

    if (isLidJid(mentionJid)) {
      await sock.sendMessage(jid, { text: `⏳ _Memproses mention..._` });

      const resolved = await resolveMentionToPhone(sock, mentionJid, groupJid);

      if (resolved && resolved.length >= 8) {
        target = resolved;
        sourceInfo = "mention (LID resolved ✅)";
        resolvedFromLid = true;
      } else {
        await sock.sendMessage(jid, {
          text:
            `⚠️ *MENTION TIDAK BISA DIPROSES*\n\n` +
            `Gunakan nomor HP langsung:\n` +
            `\`\`\`/addadmin 628xxxxxxxxxx\`\`\``,
        });
        return;
      }
    } else {
      target = jidToDigits(mentionJid);
      sourceInfo = "mention (nomor HP)";
    }
  }

  if (!target || target.length < 8) {
    await sock.sendMessage(jid, {
      text: `❌ *Format:* \`/addadmin 628xxxxxxxxxx\` atau \`/addadmin @username\``,
    });
    return;
  }

  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: `👑 *+${target}* adalah Owner.` });
    return;
  }

  if (isAdminBot(target)) {
    await sock.sendMessage(jid, { text: `⚠️ *+${target}* sudah admin bot.` });
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
      `${resolvedFromLid ? "🔄 _LID resolved_\n" : ""}` +
      `👤 Oleh: +${senderNumber}\n` +
      `📊 Total: ${admins.length}`,
  });
}

// ==========================================
// ADMIN BOT: HAPUS ADMIN BOT (Command + Mention)
// ==========================================
async function handleAdminBotDel(sock, msg, jid, senderNumber, rawText) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
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
          text: `⚠️ *MENTION TIDAK BISA DIPROSES (LID)*\nGunakan: \`\`\`/deladmin 628xxxxxxxxxx\`\`\``,
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

  await executeAdminBotDelete(sock, jid, senderNumber, target);
}

async function handleAdminBotDelFromList(sock, jid, senderNumber, rawId) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }
  const target = rawId.replace("adminbot_deladmin_", "");
  await executeAdminBotDelete(sock, jid, senderNumber, target);
}

async function executeAdminBotDelete(sock, jid, senderNumber, target) {
  if (isOwner(target)) {
    await sock.sendMessage(jid, { text: "⛔ *TIDAK BISA MENGHAPUS OWNER*" });
    return;
  }

  if (!isAdminBot(target)) {
    await sock.sendMessage(jid, { text: `❌ *+${target}* bukan admin bot.` });
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

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN BOT DIHAPUS*\n\n` +
      `📱 Nomor: +${target}\n` +
      `👤 Oleh: +${senderNumber}\n` +
      `📊 Sisa: ${admins.length}`,
  });
}

async function handleAdminBotDelList(sock, jid, senderNumber) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const admins = loadAdmins().filter((a) => {
    if (isOwner(a)) return false;
    if (normalizeNumber(a) === normalizeNumber(senderNumber)) return false;
    return true;
  });

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text: "📋 *HAPUS ADMIN*\nTidak ada admin lain yang bisa dihapus.",
    });
    return;
  }

  const rows = admins.map((a, i) => ({
    header: `Admin #${i + 1}`,
    title: `+${a}`,
    description: `Hapus +${a}`,
    id: `adminbot_deladmin_${a}`,
  }));

  await sock.sendMessage(jid, {
    text: `🗑️ *HAPUS ADMIN BOT*\nTotal tersedia: *${admins.length}*\n⚠️ Owner dan diri sendiri tidak bisa dihapus.`,
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
// EDIT BANNER (Shared Handler)
// ==========================================
async function handleEditBanner(sock, jid, senderNumber) {
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
        return `📊 *Banner Saat Ini:*\n├ 📁 Ukuran: ${(stat.size / 1024).toFixed(1)} KB\n└ 🕐 Diubah: ${new Date(stat.mtime).toLocaleString("id-ID")}\n\n`;
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
      `⏰ _Mode edit aktif 5 menit_\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });

  if (bannerExists) {
    try {
      await sock.sendMessage(jid, {
        image: fs.readFileSync(BANNER_PATH),
        caption: `📌 *Preview Banner*`,
      });
    } catch (e) {}
  }

  setTimeout(
    () => {
      const state = bannerEditState.get(senderNumber);
      if (state?.waiting) {
        bannerEditState.delete(senderNumber);
        sock
          .sendMessage(jid, { text: `⏰ *Mode edit banner habis waktu.*` })
          .catch(() => {});
      }
    },
    5 * 60 * 1000,
  );
}

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
    await sock.sendMessage(jid, { text: `❌ *Edit banner dibatalkan.*` });
    return;
  }

  const imageMsg = m.imageMessage;
  if (!imageMsg) {
    await sock.sendMessage(jid, {
      text: `⚠️ *Kirim gambar (bukan teks).*\nKetik *batal* untuk membatalkan.`,
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

    if (!buffer || buffer.length === 0) throw new Error("Buffer kosong");
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error(
        `Terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

    fs.writeFileSync(BANNER_PATH, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);
    console.log(`✅ Banner tersimpan: ${sizeKB} KB oleh +${senderNumber}`);

    await sock.sendMessage(jid, {
      image: buffer,
      caption: `✅ *BANNER DIPERBARUI!*\n📁 Ukuran: ${sizeKB} KB\n🕐 ${new Date().toLocaleString("id-ID")}\n👤 Oleh: +${senderNumber}`,
    });

    // Clean old backups
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
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL UPDATE BANNER*\nError: ${err.message}`,
    });
  }
}

// ==========================================
// ADMIN BOT ROUTER
// ==========================================
async function handleAdminBotRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminBot(senderNumber) && !isOwner(senderNumber)) return;

  if (rawId === "adminbot_list")
    await handleAdminBotList(sock, jid, senderNumber);
  else if (rawId === "adminbot_add")
    await sock.sendMessage(jid, {
      text: `➕ *TAMBAH ADMIN BOT*\n\nKirim nomor:\n\`\`\`/addadmin 628xxxxxxxxxx\`\`\` atau \`/addadmin @username\``,
    });
  else if (rawId === "adminbot_del")
    await handleAdminBotDelList(sock, jid, senderNumber);
  else if (rawId.startsWith("adminbot_deladmin_"))
    await handleAdminBotDelFromList(sock, jid, senderNumber, rawId);
  else if (rawId === "adminbot_orders")
    await handleAdminBotOrders(sock, jid, senderNumber);
  else if (rawId === "adminbot_banner")
    await handleEditBanner(sock, jid, senderNumber);
}

module.exports = {
  getAdminBotMenuSection,
  handleAdminBotRouter,
  handleAdminBotList,
  handleAdminBotAdd,
  handleAdminBotDel,
  handleAdminBotDelFromList,
  handleAdminBotOrders,
  handleEditBanner,
  handleIncomingImage,
  bannerEditState,
};
