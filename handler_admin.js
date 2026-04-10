// ==========================================
//  HANDLER_ADMIN.JS
//  Admin / Owner Panel + Edit Banner + Group Admin Manager
//  ✅ REBUILT: Full LID support untuk WhatsApp baru
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
// BOT LID CACHE
// Simpan LID bot setelah pertama kali ditemukan
// ==========================================
let cachedBotLid = null;
let cachedBotPhone = null;

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
// BASIC HELPERS
// ==========================================
function normalizeNumber(num) {
  return String(num).replace(/[^0-9]/g, "");
}

// Ekstrak digit bersih dari JID apapun
// "628xxx:12@s.whatsapp.net" → "628xxx"
// "127569823277085:0@lid"   → "127569823277085"
function jidToDigits(jid) {
  if (!jid) return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// Alias
function cleanNumber(jid) {
  return jidToDigits(jid);
}

function getNumberFromJid(jid) {
  return jidToDigits(jid);
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
// ✅ CORE: FIND BOT IN PARTICIPANTS
//
// Masalah utama: WhatsApp menggunakan 2 sistem JID:
//   1. Phone: "628xxx@s.whatsapp.net"
//   2. LID:   "127569823277085:0@lid"
//
// sock.user.id → SELALU phone format
// sock.user.lid → LID (tidak selalu ada)
//
// Di participant list group, bot BISA muncul
// sebagai LID (@lid) ATAU phone (@s.whatsapp.net)
// tergantung versi WA server.
//
// Strategi: scan SEMUA participant,
// temukan yang kemungkinan bot, simpan ke cache.
// ==========================================

// Dapatkan semua identifier bot dari sock
function getBotInfo(sock) {
  const userId = sock.user?.id || "";
  const userLid = sock.user?.lid || "";
  const phone = jidToDigits(userId);
  const lid = userLid ? jidToDigits(userLid) : "";

  return { userId, userLid, phone, lid };
}

// ==========================================
// ✅ SMART BOT FINDER
//
// Scan participant list untuk menemukan bot.
// Return participant object jika ketemu, null jika tidak.
//
// Cara kerja:
// 1. Jika cachedBotLid ada → match langsung by LID
// 2. Jika cachedBotPhone ada → match by phone
// 3. Coba match semua participant vs sock.user info
// 4. Jika semua gagal → heuristic: cari participant
//    yang digit-nya overlap dengan phone bot
// ==========================================
function findBotInParticipants(participants, sock) {
  const botInfo = getBotInfo(sock);

  console.log(`\n🔍 findBotInParticipants:`);
  console.log(`   sock.user.id: "${botInfo.userId}"`);
  console.log(`   sock.user.lid: "${botInfo.userLid}"`);
  console.log(`   phone digits: "${botInfo.phone}"`);
  console.log(`   lid digits: "${botInfo.lid}"`);
  console.log(`   cachedBotLid: "${cachedBotLid}"`);
  console.log(`   cachedBotPhone: "${cachedBotPhone}"`);

  // ── PASS 1: Gunakan cache LID ────────────
  if (cachedBotLid) {
    for (const p of participants) {
      const pDigits = jidToDigits(p.id);
      const pDomain = p.id.split("@")[1] || "";
      if (pDomain === "lid" && pDigits === cachedBotLid) {
        console.log(`   ✅ [Cache-LID] Found: "${p.id}" admin=${p.admin}`);
        return p;
      }
    }
  }

  // ── PASS 2: Gunakan cache Phone ──────────
  if (cachedBotPhone) {
    for (const p of participants) {
      const pDigits = jidToDigits(p.id);
      const pDomain = p.id.split("@")[1] || "";
      if (pDomain !== "lid" && pDigits === cachedBotPhone) {
        console.log(`   ✅ [Cache-Phone] Found: "${p.id}" admin=${p.admin}`);
        return p;
      }
    }
  }

  // ── PASS 3: Match by phone (dari sock.user.id) ──
  if (botInfo.phone) {
    for (const p of participants) {
      const pDigits = jidToDigits(p.id);
      const pDomain = p.id.split("@")[1] || "";
      if (pDomain !== "lid" && pDigits === botInfo.phone) {
        console.log(`   ✅ [Phone-Match] Found: "${p.id}" admin=${p.admin}`);
        cachedBotPhone = botInfo.phone;
        return p;
      }
    }
  }

  // ── PASS 4: Match by LID (dari sock.user.lid) ──
  if (botInfo.lid) {
    for (const p of participants) {
      const pDigits = jidToDigits(p.id);
      const pDomain = p.id.split("@")[1] || "";
      if (pDomain === "lid" && pDigits === botInfo.lid) {
        console.log(`   ✅ [LID-Match] Found: "${p.id}" admin=${p.admin}`);
        cachedBotLid = botInfo.lid;
        return p;
      }
    }
  }

  // ── PASS 5: Match by last N digits (phone) ──
  // Toleran perbedaan kode negara
  if (botInfo.phone && botInfo.phone.length >= 8) {
    const suffix = botInfo.phone.slice(-8);
    for (const p of participants) {
      const pDigits = jidToDigits(p.id);
      const pDomain = p.id.split("@")[1] || "";
      if (pDomain !== "lid" && pDigits.endsWith(suffix)) {
        console.log(
          `   ✅ [Suffix-Phone] Found: "${p.id}" suffix="${suffix}" admin=${p.admin}`,
        );
        cachedBotPhone = pDigits;
        return p;
      }
    }
  }

  // ── PASS 6: Cek semua @lid participants ─────────
  // Jika bot muncul sebagai LID tapi kita tidak tahu LID-nya,
  // kita perlu identify mana yang bot.
  // Caranya: bot adalah satu-satunya participant dengan
  // domain @lid yang NOT ada di phone participant list.
  // (Heuristic — hanya jika 1 @lid participant)
  const lidParticipants = participants.filter(
    (p) => (p.id.split("@")[1] || "") === "lid",
  );
  const phoneParticipants = participants.filter(
    (p) => (p.id.split("@")[1] || "") !== "lid",
  );

  console.log(`   📊 LID participants: ${lidParticipants.length}`);
  console.log(`   📊 Phone participants: ${phoneParticipants.length}`);

  // Jika hanya ada 1 LID participant → kemungkinan besar itu bot
  if (lidParticipants.length === 1 && phoneParticipants.length >= 1) {
    const candidate = lidParticipants[0];
    console.log(
      `   ⚠️ [Heuristic-1LID] Candidate: "${candidate.id}" admin=${candidate.admin}`,
    );

    // Simpan LID ke cache untuk penggunaan berikutnya
    cachedBotLid = jidToDigits(candidate.id);
    return candidate;
  }

  // ── PASS 7: Debug dump semua participant ────────
  console.log(`   ❌ Bot NOT found! All participants:`);
  for (const p of participants) {
    const pDigits = jidToDigits(p.id);
    const pDomain = p.id.split("@")[1] || "";
    console.log(
      `      "${p.id}" | domain: ${pDomain} | digits: "${pDigits}" | admin: ${p.admin || "none"}`,
    );
  }

  return null;
}

// ==========================================
// ✅ CEK BOT ADMIN DI GROUP
// ==========================================
async function isBotAdminInGroup(sock, groupJid) {
  try {
    // Fetch fresh metadata
    const meta = await sock.groupMetadata(groupJid);
    console.log(`\n🔍 isBotAdmin - Group: "${meta.subject}" (${groupJid})`);

    const botParticipant = findBotInParticipants(meta.participants, sock);

    if (!botParticipant) {
      // Fallback: coba via groupFetchAllParticipating cache
      console.log(`   ⚠️ Trying cache fallback...`);
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const cached = allGroups[groupJid];
        if (cached?.participants) {
          const botP = findBotInParticipants(cached.participants, sock);
          if (botP) {
            const isAdm = botP.admin === "admin" || botP.admin === "superadmin";
            console.log(`   ✅ Found in cache! admin=${isAdm}`);
            return isAdm;
          }
        }
      } catch (e) {
        console.error(`   Cache fallback error: ${e.message}`);
      }

      console.log(`   ❌ Bot not found anywhere`);
      return false;
    }

    const isAdm =
      botParticipant.admin === "admin" || botParticipant.admin === "superadmin";
    console.log(`   ✅ Bot found! admin=${isAdm} (${botParticipant.admin})`);
    return isAdm;
  } catch (err) {
    console.error(`❌ isBotAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ GET JOINED GROUPS
// Simpan botIsAdmin langsung di result
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    console.log(`\n📋 getJoinedGroups: ${groupList.length} groups`);

    const result = [];

    for (const g of groupList) {
      let freshMeta = null;
      let participants = g.participants || [];
      let botIsAdmin = false;

      // Fetch fresh metadata
      try {
        freshMeta = await sock.groupMetadata(g.id);
        participants = freshMeta.participants || [];
      } catch (e) {
        console.warn(`   ⚠️ Fresh meta failed for ${g.id}: ${e.message}`);
      }

      // Find bot
      const botP = findBotInParticipants(participants, sock);
      if (botP) {
        botIsAdmin = botP.admin === "admin" || botP.admin === "superadmin";
        console.log(
          `   ✅ "${freshMeta?.subject || g.subject}" → bot: "${botP.id}" admin=${botIsAdmin}`,
        );
      } else {
        console.log(
          `   ❌ "${freshMeta?.subject || g.subject}" → bot not found`,
        );
      }

      result.push({
        jid: g.id,
        name: freshMeta?.subject || g.subject || "Unknown Group",
        participants,
        botIsAdmin,
      });
    }

    const adminCount = result.filter((g) => g.botIsAdmin).length;
    console.log(
      `   📊 Result: ${result.length} groups, ${adminCount} as admin\n`,
    );

    return result;
  } catch (err) {
    console.error(`❌ getJoinedGroups error: ${err.message}`);
    return [];
  }
}

// ==========================================
// ✅ EXPOSE: Set Bot LID dari luar
// Panggil ini saat bot pertama connect
// dan saat menerima event group-participant-update
// ==========================================
function setBotLidCache(lid) {
  if (lid) {
    const digits = jidToDigits(lid);
    if (digits) {
      cachedBotLid = digits;
      console.log(`💾 Bot LID cached: "${digits}"`);
    }
  }
}

function setBotPhoneCache(phone) {
  if (phone) {
    const digits = jidToDigits(phone);
    if (digits) {
      cachedBotPhone = digits;
      console.log(`💾 Bot Phone cached: "${digits}"`);
    }
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
// HANDLER: DEL ADMIN BOT
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

async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  if (!isAdminOrOwner(senderNumber)) return;
  await executeDeleteAdmin(
    sock,
    jid,
    senderNumber,
    text.replace("deladmin_", ""),
  );
}

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
// KIRIM LIST DELETE ADMIN
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
// ADMIN: LIST ORDER
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
// 🖼️ EDIT BANNER
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
      const bannerBuffer = fs.readFileSync(BANNER_PATH);
      await sock.sendMessage(jid, {
        image: bannerBuffer,
        caption: `📌 *Preview Banner Saat Ini*`,
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
            text: `⏰ *Mode edit banner habis waktu.*\n\nKetik *edit_banner* untuk mencoba lagi.`,
          })
          .catch(() => {});
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// 🖼️ PROSES GAMBAR MASUK
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
      text: `⚠️ *Kirim gambar* untuk mengganti banner.\n❌ Ketik *batal* untuk membatalkan.`,
    });
    return;
  }

  console.log(`🖼️ Menerima gambar banner dari ${senderNumber}...`);
  bannerEditState.delete(senderNumber);

  await sock.sendMessage(jid, { text: `⏳ *Memproses banner baru...*` });

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
      throw new Error("Buffer gambar kosong.");
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error(
        `Ukuran terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

    fs.writeFileSync(BANNER_PATH, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);

    await sock.sendMessage(jid, {
      image: buffer,
      caption:
        `✅ *BANNER BERHASIL DIPERBARUI!*\n\n` +
        `📁 Ukuran: ${sizeKB} KB\n` +
        `🕐 ${new Date().toLocaleString("id-ID")}`,
    });
  } catch (err) {
    console.error(`❌ Gagal simpan banner: ${err.message}`);
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL*\n\n${err.message}\n\nKetik *edit_banner* untuk mencoba lagi.`,
    });
  }

  // Bersihkan backup lama
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
}

// ==========================================
// 👥 GROUP MANAGER — MENU UTAMA
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data group...*` });

  const joinedGroups = await getJoinedGroups(sock);
  const adminCount = joinedGroups.filter((g) => g.botIsAdmin).length;
  const nonAdminCount = joinedGroups.filter((g) => !g.botIsAdmin).length;

  // Debug info
  const botInfo = getBotInfo(sock);
  const debugText =
    `\n📟 *Debug Bot ID:*\n` +
    `├ Phone: ${botInfo.phone || "-"}\n` +
    `├ LID: ${botInfo.lid || "-"}\n` +
    `├ Cache Phone: ${cachedBotPhone || "-"}\n` +
    `└ Cache LID: ${cachedBotLid || "-"}\n`;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status Bot di Group:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot admin: ${adminCount} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminCount} group\n` +
      debugText +
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
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
// 👥 PILIH GROUP UNTUK AKSI
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
      text: `❌ *Tidak ada group ditemukan.*\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  const adminGroupRows = [];
  const nonAdminGroupRows = [];

  for (const g of joinedGroups) {
    const adminCount = g.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    ).length;
    const memberCount = g.participants.length;
    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;

    if (g.botIsAdmin) {
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
          action === "view" ? `Lihat saja` : `⚠️ Promote bot jadi admin dulu`,
        id:
          action === "view"
            ? `grpselect_view_${g.jid}`
            : `grpnotadmin_${g.jid}`,
      });
    }
  }

  const sections = [];

  if (adminGroupRows.length > 0) {
    for (let i = 0; i < adminGroupRows.length; i += 10) {
      sections.push({
        title: `✅ Bot Sudah Admin (${adminGroupRows.length})`,
        rows: adminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (nonAdminGroupRows.length > 0) {
    for (let i = 0; i < nonAdminGroupRows.length; i += 10) {
      sections.push({
        title: `⚠️ Bot Bukan Admin (${nonAdminGroupRows.length})`,
        rows: nonAdminGroupRows.slice(i, i + 10),
      });
    }
  }

  if (sections.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak ada group.\n\nKetik *group_manager* untuk kembali.`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Bot bergabung di *${joinedGroups.length}* group:\n` +
      `├ ✅ Bot admin: *${adminGroupRows.length}*\n` +
      `└ ⚠️ Bot bukan admin: *${nonAdminGroupRows.length}*\n\n` +
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
// PERINGATAN BOT BUKAN ADMIN
// ==========================================
async function handleBotNotAdmin(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  let groupName = groupJid;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupName = meta?.subject || groupJid;
  } catch (e) {}

  await sock.sendMessage(jid, {
    text:
      `⚠️ *BOT BUKAN ADMIN GROUP*\n\n` +
      `👥 *Group:* ${groupName}\n\n` +
      `❌ Bot tidak bisa promote/demote.\n\n` +
      `✅ *Cara jadikan bot admin:*\n` +
      `1️⃣ Buka group *${groupName}*\n` +
      `2️⃣ Info Group → Tap kontak bot\n` +
      `3️⃣ Pilih *Jadikan Admin*\n\n` +
      `Setelah itu ketik *group_manager* lagi.`,
  });
}

// ==========================================
// PROMOTE: PILIH GROUP → TAMPILKAN MEMBER
// ==========================================
async function handleGroupSelectedForPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data member...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil data group.`,
    });
    return;
  }

  const groupName = meta.subject || groupJid;

  // Verifikasi ulang bot admin dengan fresh data
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Ambil bot participant untuk exclude dari list
  const botP = findBotInParticipants(meta.participants, sock);
  const botJidFull = botP?.id || "";

  // Filter: tampilkan member biasa saja (bukan admin, bukan bot)
  const members = meta.participants.filter((p) => {
    if (p.admin === "admin" || p.admin === "superadmin") return false;
    if (botJidFull && p.id === botJidFull) return false;
    // Extra: exclude by digits jika bot ditemukan
    if (botP && jidToDigits(p.id) === jidToDigits(botP.id)) return false;
    return true;
  });

  const adminCount = meta.participants.filter(
    (p) => p.admin === "admin" || p.admin === "superadmin",
  ).length;

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada member untuk di-promote.*\n\n` +
        `👥 Group: *${groupName}*\n` +
        `Semua anggota sudah admin.`,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < members.length; i += 10) {
    const chunk = members.slice(i, i + 10);
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + 10, members.length)})`,
      rows: chunk.map((p) => {
        const number = jidToDigits(p.id);
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
      `💬 Atau command di group:\n\`\`\`/promote @user\`\`\`\n\n` +
      `Pilih member 👇`,
    footer: `✅ Bot sudah admin`,
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
// DEMOTE: PILIH GROUP → TAMPILKAN ADMIN
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;

  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const botP = findBotInParticipants(meta.participants, sock);
  const botJidFull = botP?.id || "";

  // Admin biasa (exclude: superadmin/owner, dan bot sendiri)
  const admins = meta.participants.filter((p) => {
    if (p.admin !== "admin") return false;
    if (botJidFull && p.id === botJidFull) return false;
    if (botP && jidToDigits(p.id) === jidToDigits(botP.id)) return false;
    return true;
  });

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner (tidak bisa di-demote):*\n` +
          superAdmins.map((p) => `└ +${jidToDigits(p.id)}`).join("\n")
        : "";

    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada admin yang bisa di-demote.*\n\n` +
        `👥 Group: *${groupName}*` +
        superList,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < admins.length; i += 10) {
    const chunk = admins.slice(i, i + 10);
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + 10, admins.length)})`,
      rows: chunk.map((p) => {
        const number = jidToDigits(p.id);
        return {
          header: `⬇️ Demote ke Member`,
          title: `+${number}`,
          description: `Turunkan +${number} jadi member`,
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
      `💬 Atau command di group:\n\`\`\`/demote @user\`\`\`\n\n` +
      `Pilih admin 👇`,
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
// VIEW: TAMPILKAN INFO ADMIN GROUP
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  if (!isAdminOrOwner(senderNumber)) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;
  const totalMembers = meta.participants.length;

  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  const botP = findBotInParticipants(meta.participants, sock);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *INFO ADMIN GROUP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n`;

  if (botP) {
    text += `🔑 *Bot JID:* ${botP.id}\n`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const number = jidToDigits(p.id);
      const isBot = botP && p.id === botP.id;
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const number = jidToDigits(p.id);
      const isBot = botP && p.id === botP.id;
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 +${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// EXECUTE PROMOTE
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mempromote +${targetNumber}...*` });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");

    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || groupJid;

    console.log(`⬆️ Promote OK: +${targetNumber} @ ${groupName}`);

    await sock.sendMessage(jid, {
      text:
        `✅ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 Member → 🛡️ Admin\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
    });
  } catch (err) {
    console.error(`❌ Promote failed: ${err.message}`);
    let msg = err.message;
    if (msg.includes("not-authorized")) msg = "Bot bukan admin group.";
    if (msg.includes("not-participant")) msg = "User bukan anggota group.";
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL PROMOTE*\n\n+${targetNumber}\n${msg}`,
    });
  }
}

// ==========================================
// EXECUTE DEMOTE
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetNumber = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mendemote +${targetNumber}...*` });

  try {
    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");

    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || groupJid;

    console.log(`⬇️ Demote OK: +${targetNumber} @ ${groupName}`);

    await sock.sendMessage(jid, {
      text:
        `✅ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* +${targetNumber}\n` +
        `🔄 🛡️ Admin → Member\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
    });
  } catch (err) {
    console.error(`❌ Demote failed: ${err.message}`);
    let msg = err.message;
    if (msg.includes("not-authorized")) msg = "Bot bukan admin group.";
    if (msg.includes("not-participant")) msg = "Bukan anggota group.";
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL DEMOTE*\n\n+${targetNumber}\n${msg}`,
    });
  }
}

// ==========================================
// COMMAND /promote @user (di group)
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di *group*.`,
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
      text: `⚠️ *Bot bukan admin group ini.*\n\nJadikan bot admin terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Format: \`/promote @user\``,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const num = jidToDigits(targetJid);
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "promote");
      results.push(`✅ +${num} → 🛡️ Admin`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ +${num} → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    { text: `⬆️ *HASIL PROMOTE*\n\n${results.join("\n")}` },
    { quoted: msg },
  );
}

// ==========================================
// COMMAND /demote @user (di group)
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di *group*.`,
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
      text: `⚠️ *Bot bukan admin group ini.*\n\nJadikan bot admin terlebih dahulu.`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Format: \`/demote @user\``,
    });
    return;
  }

  const results = [];
  for (const targetJid of mentions) {
    const num = jidToDigits(targetJid);
    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "demote");
      results.push(`✅ +${num} → 👤 Member`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ +${num} → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    { text: `⬇️ *HASIL DEMOTE*\n\n${results.join("\n")}` },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminOrOwner(senderNumber)) return;

  if (rawId.startsWith("grpnotadmin_")) {
    const groupJid = rawId.replace("grpnotadmin_", "");
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  if (rawId.startsWith("grpselect_")) {
    const withoutPrefix = rawId.replace("grpselect_", "");
    const idx = withoutPrefix.indexOf("_");
    if (idx === -1) return;
    const action = withoutPrefix.substring(0, idx);
    const groupJid = withoutPrefix.substring(idx + 1);

    if (action === "promote")
      await handleGroupSelectedForPromote(sock, jid, senderNumber, groupJid);
    else if (action === "demote")
      await handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid);
    else if (action === "view")
      await handleGroupViewAdmins(sock, jid, senderNumber, groupJid);
    return;
  }

  if (rawId.startsWith("grppromote_")) {
    const without = rawId.replace("grppromote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  if (rawId.startsWith("grpdemote_")) {
    const without = rawId.replace("grpdemote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupDemote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }
}

// ==========================================
// ADMIN MENU SECTION (untuk menu utama)
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
          ? "Ganti banner (ada)"
          : "Upload banner (belum ada)",
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
  // Bot admin
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,

  // Banner
  handleEditBanner,
  handleIncomingImage,

  // Group admin manager
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,
  handlePromoteCommand,
  handleDemoteCommand,

  // UI helpers
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
  cleanNumber,
  jidToDigits,

  // LID cache (dipanggil dari index.js)
  setBotLidCache,
  setBotPhoneCache,
  findBotInParticipants,
  getBotInfo,
};
