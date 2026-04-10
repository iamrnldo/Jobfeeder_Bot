// ==========================================
//  HANDLER_ADMIN.JS
//  ✅ Fixed: LID → Phone JID via contact lookup
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");
const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");
const BANNER_DIR = path.join(__dirname, "images", "menu");

const bannerEditState = new Map();

const BOT_LID_LIST = ["127569823277085"];

let runtimeBotPhone = null;
let runtimeBotLid = null;

// ==========================================
// ✅ LID → PHONE MAPPING CACHE
// Simpan hasil lookup LID → phone
// ==========================================
const lidPhoneCache = new Map();

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
// HELPERS
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
  if (!fs.existsSync(BANNER_DIR)) fs.mkdirSync(BANNER_DIR, { recursive: true });
}

// ==========================================
// ✅ SET RUNTIME BOT INFO
// ==========================================
function setBotRuntimeInfo(sock) {
  const userId = sock.user?.id || "";
  const userLid = sock.user?.lid || "";

  if (userId) {
    runtimeBotPhone = jidToDigits(userId);
    console.log(`💾 Bot phone cached: "${runtimeBotPhone}"`);
  }

  if (userLid) {
    runtimeBotLid = jidToDigits(userLid);
    if (!BOT_LID_LIST.includes(runtimeBotLid)) {
      BOT_LID_LIST.push(runtimeBotLid);
      console.log(`💾 Bot LID added: "${runtimeBotLid}"`);
    }
  }

  // Cache bot sendiri
  if (runtimeBotLid && runtimeBotPhone) {
    lidPhoneCache.set(runtimeBotLid, runtimeBotPhone);
    console.log(
      `💾 Bot LID→Phone cached: ${runtimeBotLid} → ${runtimeBotPhone}`,
    );
  }

  console.log(`📋 BOT_LID_LIST: [${BOT_LID_LIST.join(", ")}]`);
}

// ==========================================
// ✅ IS PARTICIPANT BOT?
// ==========================================
function isParticipantBot(participantJid) {
  if (!participantJid) return false;
  const pDigits = jidToDigits(participantJid);
  const pDomain = (participantJid.split("@")[1] || "").toLowerCase();

  if (pDomain === "lid") {
    for (const lid of BOT_LID_LIST) {
      if (pDigits === lid) return true;
    }
  }

  if (pDomain !== "lid" && runtimeBotPhone && pDigits === runtimeBotPhone)
    return true;

  if (
    pDomain !== "lid" &&
    runtimeBotPhone &&
    pDigits.length >= 8 &&
    runtimeBotPhone.length >= 8 &&
    pDigits.slice(-8) === runtimeBotPhone.slice(-8)
  )
    return true;

  return false;
}

// ==========================================
// ✅ FIND BOT IN PARTICIPANTS
// ==========================================
function findBotInParticipants(participants) {
  if (!participants || participants.length === 0) return null;

  console.log(`\n🔍 findBotInParticipants (${participants.length} total):`);
  console.log(`   BOT_LID_LIST: [${BOT_LID_LIST.join(", ")}]`);
  console.log(`   runtimeBotPhone: "${runtimeBotPhone || "not set"}"`);

  for (const p of participants) {
    const pDigits = jidToDigits(p.id);
    const pDomain = (p.id.split("@")[1] || "").toLowerCase();
    const isBot = isParticipantBot(p.id);
    console.log(
      `   [${isBot ? "✅BOT" : "   "}] "${p.id}" | domain:${pDomain} | digits:"${pDigits}" | admin:${p.admin || "none"}`,
    );
    if (isBot) return p;
  }

  console.log(`   ❌ Bot not found`);
  return null;
}

// ==========================================
// ✅ CORE FIX: RESOLVE LID → PHONE JID
//
// Masalah: Semua participant pakai @lid format.
// Tidak ada phone JID di participant list.
//
// Solusi bertingkat:
// 1. Cek cache lidPhoneCache
// 2. Cek participant yang punya phone JID
// 3. Gunakan sock.onWhatsApp() untuk lookup
// 4. Gunakan store/contact jika tersedia
// 5. Fallback: kirim dengan LID langsung
// ==========================================
async function resolveToPhoneJid(sock, groupJid, mentionJid) {
  const mentionDigits = jidToDigits(mentionJid);
  const mentionDomain = (mentionJid.split("@")[1] || "").toLowerCase();

  console.log(`🔄 resolveToPhoneJid: "${mentionJid}"`);

  // Sudah phone JID
  if (mentionDomain === "s.whatsapp.net") {
    const clean = `${mentionDigits}@s.whatsapp.net`;
    console.log(`   ✅ Already phone JID: "${clean}"`);
    return clean;
  }

  // ── STEP 1: Cek cache ────────────────────
  if (lidPhoneCache.has(mentionDigits)) {
    const cached = lidPhoneCache.get(mentionDigits);
    const result = `${cached}@s.whatsapp.net`;
    console.log(`   ✅ Cache hit: ${mentionDigits} → "${result}"`);
    return result;
  }

  // ── STEP 2: Cari di participant list (phone) ──
  try {
    const meta = await sock.groupMetadata(groupJid);
    const allParticipants = meta.participants || [];

    console.log(`   👥 All participants: ${allParticipants.length}`);

    // Cari phone participant dengan suffix match
    const phoneParticipants = allParticipants.filter(
      (p) => (p.id.split("@")[1] || "") !== "lid",
    );

    console.log(`   📱 Phone participants: ${phoneParticipants.length}`);

    // Exact match dulu
    for (const p of phoneParticipants) {
      if (jidToDigits(p.id) === mentionDigits) {
        const result = `${jidToDigits(p.id)}@s.whatsapp.net`;
        lidPhoneCache.set(mentionDigits, jidToDigits(p.id));
        console.log(`   ✅ Exact match: "${result}"`);
        return result;
      }
    }

    // Suffix match
    for (const len of [9, 8, 7]) {
      if (mentionDigits.length >= len) {
        const suffix = mentionDigits.slice(-len);
        for (const p of phoneParticipants) {
          const pDigits = jidToDigits(p.id);
          if (pDigits.slice(-len) === suffix) {
            const result = `${pDigits}@s.whatsapp.net`;
            lidPhoneCache.set(mentionDigits, pDigits);
            console.log(`   ✅ Suffix-${len} match: "${result}"`);
            return result;
          }
        }
      }
    }
  } catch (e) {
    console.error(`   ⚠️ Meta fetch error: ${e.message}`);
  }

  // ── STEP 3: Coba sock.onWhatsApp() ──────────
  // onWhatsApp tidak bisa lookup LID langsung,
  // tapi kita bisa coba lookup via contact store
  console.log(`   ⚠️ Phone participants not found, trying contact store...`);

  try {
    // Coba ambil dari store (jika tersedia)
    // Store menyimpan mapping JID → contact info
    if (sock.store?.contacts) {
      const contacts = sock.store.contacts;
      for (const [contactJid, contact] of Object.entries(contacts)) {
        const cDomain = (contactJid.split("@")[1] || "").toLowerCase();
        if (cDomain === "lid") {
          const cDigits = jidToDigits(contactJid);
          if (cDigits === mentionDigits) {
            // Cari phone version dari contact ini
            const phoneName = contact.lid ? jidToDigits(contact.lid) : null;
            if (phoneName) {
              const result = `${phoneName}@s.whatsapp.net`;
              lidPhoneCache.set(mentionDigits, phoneName);
              console.log(`   ✅ Store LID match: "${result}"`);
              return result;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`   ⚠️ Store lookup error: ${e.message}`);
  }

  // ── STEP 4: Gunakan LID JID langsung ────────
  // Beberapa versi baileys support groupParticipantsUpdate
  // dengan LID JID langsung
  const lidJid = `${mentionDigits}@lid`;
  console.log(`   ⚠️ Fallback: menggunakan LID JID langsung: "${lidJid}"`);
  return lidJid;
}

// ==========================================
// ✅ SCAN PARTICIPANTS & BUILD LID→PHONE CACHE
// Panggil ini saat bot masuk group atau
// saat pertama kali mengakses group
// ==========================================
async function buildLidPhoneCache(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];

    let cached = 0;
    const phoneMap = new Map(); // digits → full jid

    // Kumpulkan semua phone participant
    for (const p of participants) {
      const domain = (p.id.split("@")[1] || "").toLowerCase();
      if (domain !== "lid") {
        const digits = jidToDigits(p.id);
        phoneMap.set(digits, p.id);
      }
    }

    // Untuk LID participant, coba match dengan phone
    // (heuristic: urutan, suffix)
    for (const p of participants) {
      const domain = (p.id.split("@")[1] || "").toLowerCase();
      if (domain === "lid") {
        const lidDigits = jidToDigits(p.id);
        if (!lidPhoneCache.has(lidDigits)) {
          // Tidak bisa auto-map tanpa info tambahan
          // Tandai sebagai "unresolved"
          console.log(`   ⚠️ Unresolved LID: "${p.id}"`);
        }
      }
    }

    console.log(`💾 LID cache built: ${lidPhoneCache.size} entries`);
    return lidPhoneCache.size;
  } catch (e) {
    console.error(`❌ buildLidPhoneCache error: ${e.message}`);
    return 0;
  }
}

// ==========================================
// ✅ REGISTER LID → PHONE MAPPING
// Panggil dari index.js saat ada event
// group-participants.update atau messages
// ==========================================
function registerLidPhoneMapping(lid, phone) {
  if (!lid || !phone) return;
  const lidDigits = jidToDigits(lid);
  const phoneDigits = jidToDigits(phone);
  if (lidDigits && phoneDigits && !lidPhoneCache.has(lidDigits)) {
    lidPhoneCache.set(lidDigits, phoneDigits);
    console.log(`💾 LID→Phone registered: ${lidDigits} → ${phoneDigits}`);
  }
}

// ==========================================
// ✅ CEK BOT ADMIN DI GROUP
// ==========================================
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    console.log(`\n🔍 isBotAdmin - "${meta.subject}"`);

    let botP = findBotInParticipants(meta.participants);

    if (!botP) {
      console.log(`   ⚠️ Trying cache fallback...`);
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const cached = allGroups[groupJid];
        if (cached?.participants) {
          botP = findBotInParticipants(cached.participants);
          if (botP) console.log(`   ✅ Found in cache: "${botP.id}"`);
        }
      } catch (e) {
        console.error(`   Cache fallback error: ${e.message}`);
      }
    }

    if (!botP) {
      console.log(`   ❌ Bot not found → NOT admin`);
      return false;
    }

    const isAdm = botP.admin === "admin" || botP.admin === "superadmin";
    console.log(
      `   ✅ Bot: "${botP.id}" | admin:${isAdm} (${botP.admin || "none"})`,
    );
    return isAdm;
  } catch (err) {
    console.error(`❌ isBotAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ GET JOINED GROUPS
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    console.log(`\n📋 getJoinedGroups: ${groupList.length} groups`);

    const result = [];

    for (const g of groupList) {
      let participants = g.participants || [];
      let groupName = g.subject || "Unknown Group";
      let botIsAdmin = false;

      try {
        const freshMeta = await sock.groupMetadata(g.id);
        participants = freshMeta.participants || [];
        groupName = freshMeta.subject || groupName;
      } catch (e) {
        console.warn(`   ⚠️ Fresh meta failed "${groupName}": ${e.message}`);
      }

      const botP = findBotInParticipants(participants);
      if (botP) {
        botIsAdmin = botP.admin === "admin" || botP.admin === "superadmin";
        console.log(
          `   ✅ "${groupName}" → bot:"${botP.id}" admin:${botIsAdmin}`,
        );
      } else {
        console.log(`   ❌ "${groupName}" → bot not found`);
      }

      result.push({ jid: g.id, name: groupName, participants, botIsAdmin });
    }

    const adminCount = result.filter((g) => g.botIsAdmin).length;
    console.log(`   📊 ${result.length} groups, ${adminCount} as admin\n`);
    return result;
  } catch (err) {
    console.error(`❌ getJoinedGroups error: ${err.message}`);
    return [];
  }
}

// ==========================================
// ✅ EXECUTE PROMOTE/DEMOTE dengan retry
// Coba beberapa format JID:
//   1. Phone JID (resolved)
//   2. LID JID langsung
//   3. Original mention JID
// ==========================================
async function executeParticipantUpdate(sock, groupJid, targetJid, action) {
  const targetDigits = jidToDigits(targetJid);
  const targetDomain = (targetJid.split("@")[1] || "").toLowerCase();

  console.log(`\n⚙️ executeParticipantUpdate: "${targetJid}" action:${action}`);

  // Kumpulkan JID yang akan dicoba
  const jidsToTry = [];

  // 1. Coba resolve ke phone dulu
  const resolvedPhone = await resolveToPhoneJid(sock, groupJid, targetJid);
  const resolvedDigits = jidToDigits(resolvedPhone);
  const resolvedDomain = (resolvedPhone.split("@")[1] || "").toLowerCase();

  if (resolvedDomain === "s.whatsapp.net") {
    jidsToTry.push({ jid: resolvedPhone, label: "phone" });
  }

  // 2. LID JID langsung
  if (targetDomain === "lid") {
    jidsToTry.push({ jid: targetJid, label: "lid-original" });
    jidsToTry.push({ jid: `${targetDigits}@lid`, label: "lid-clean" });
  }

  // 3. Fallback digit as phone
  jidsToTry.push({
    jid: `${targetDigits}@s.whatsapp.net`,
    label: "digits-phone",
  });

  console.log(`   JIDs to try: ${jidsToTry.map((j) => j.label).join(", ")}`);

  let lastError = null;

  for (const { jid, label } of jidsToTry) {
    try {
      console.log(`   🔄 Trying [${label}]: "${jid}"`);
      await sock.groupParticipantsUpdate(groupJid, [jid], action);
      console.log(`   ✅ Success with [${label}]: "${jid}"`);

      // Simpan mapping ke cache jika berhasil dengan phone JID
      if (label === "phone" || label === "digits-phone") {
        if (targetDomain === "lid") {
          registerLidPhoneMapping(targetJid, jid);
        }
      }

      return { success: true, usedJid: jid, label };
    } catch (err) {
      console.error(`   ❌ Failed [${label}]: ${err.message}`);
      lastError = err;

      // Jika error bukan network/timeout, stop trying phone variants
      if (err.message?.includes("not-participant")) {
        break; // User memang bukan anggota
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Unknown error",
  };
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

  await sock.sendMessage(jid, {
    text: `✅ *ADMIN DITAMBAHKAN*\n\n📱 Nomor: ${target}\n📊 Total admin: ${admins.length}`,
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

  await sock.sendMessage(jid, {
    text: `🗑️ *ADMIN DIHAPUS*\n\n📱 Nomor: ${target}\n📊 Sisa admin: ${admins.length}`,
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
    `👑 *OWNER:*\n└ 📱 ${config.ownerNumber}\n\n` +
    `🛡️ *ADMIN (${admins.length}):*\n`;

  if (admins.length === 0) {
    text += `└ _Belum ada admin_\n`;
  } else {
    admins.forEach((a, i) => {
      text += `${i === admins.length - 1 ? "└" : "├"} 📱 ${a}\n`;
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
      text: `📋 *DELETE ADMIN*\n\n_Belum ada admin._\n\nTambah:\n\`\`\`/addadmin 628xxx\`\`\``,
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
    text: `🗑️ *DELETE ADMIN*\n\nPilih admin yang ingin dihapus.\nTotal: *${admins.length}*`,
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
    `├ ✅ Lunas: ${completed}\n├ ⏳ Pending: ${pending}\n` +
    `├ 🚫 Dibatalkan: ${cancelled}\n├ 📦 Total: ${all.length}\n` +
    `└ 💰 Revenue: ${pakasir.formatRupiah(revenue)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  orders.forEach((o, i) => {
    text +=
      `*${i + 1}. ${o.orderId}*\n` +
      `   💼 ${o.serviceName}\n💰 ${pakasir.formatRupiah(o.amount)}\n` +
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
      `${bannerInfo}━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📤 *Kirim gambar baru untuk mengganti banner menu.*\n\n` +
      `📋 *Ketentuan:*\n├ Format: JPG / PNG\n├ Rasio ideal: 16:9 atau 4:3\n` +
      `├ Resolusi min: 800 x 400 px\n└ Ukuran max: 5 MB\n\n` +
      `⏰ _Mode edit aktif 5 menit_\n❌ Ketik *batal* untuk membatalkan`,
  });

  if (bannerExists) {
    try {
      await sock.sendMessage(jid, {
        image: fs.readFileSync(BANNER_PATH),
        caption: `📌 *Preview Banner Saat Ini*`,
      });
    } catch (err) {}
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
    await sock.sendMessage(jid, { text: `❌ *Edit banner dibatalkan.*` });
    return;
  }

  if (!m.imageMessage) {
    await sock.sendMessage(jid, {
      text: `⚠️ *Kirim gambar* untuk mengganti banner.\n❌ Ketik *batal* untuk membatalkan.`,
    });
    return;
  }

  bannerEditState.delete(senderNumber);
  await sock.sendMessage(jid, { text: `⏳ *Memproses banner baru...*` });

  try {
    const { downloadMediaMessage } = require("atexovi-baileys");
    ensureBannerDir();

    if (fs.existsSync(BANNER_PATH)) {
      fs.copyFileSync(
        BANNER_PATH,
        path.join(BANNER_DIR, `banner_menu_backup_${Date.now()}.jpg`),
      );
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

    if (!buffer || buffer.length === 0) throw new Error("Buffer kosong.");
    if (buffer.length > 5 * 1024 * 1024)
      throw new Error(
        `Terlalu besar: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

    fs.writeFileSync(BANNER_PATH, buffer);
    const sizeKB = (buffer.length / 1024).toFixed(1);

    await sock.sendMessage(jid, {
      image: buffer,
      caption: `✅ *BANNER DIPERBARUI!*\n\n📁 ${sizeKB} KB\n🕐 ${new Date().toLocaleString("id-ID")}`,
    });
  } catch (err) {
    try {
      const backups = fs
        .readdirSync(BANNER_DIR)
        .filter((f) => f.startsWith("banner_menu_backup_"))
        .sort()
        .reverse();
      if (backups.length > 0)
        fs.copyFileSync(path.join(BANNER_DIR, backups[0]), BANNER_PATH);
    } catch (e) {}

    await sock.sendMessage(jid, {
      text: `❌ *GAGAL*\n\n${err.message}\n\nKetik *edit_banner* lagi.`,
    });
    return;
  }

  try {
    const backups = fs
      .readdirSync(BANNER_DIR)
      .filter((f) => f.startsWith("banner_menu_backup_"))
      .sort()
      .reverse();
    for (let i = 3; i < backups.length; i++)
      fs.unlinkSync(path.join(BANNER_DIR, backups[i]));
  } catch (e) {}
}

// ==========================================
// 👥 GROUP MANAGER MENU
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

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Status Bot di Group:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot admin: ${adminCount} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminCount} group\n\n` +
      `🤖 *Bot LID:* ${BOT_LID_LIST.join(", ")}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Cara penggunaan:*\n` +
      `├ ⬆️ *Promote* → jadikan member jadi admin\n` +
      `├ ⬇️ *Demote* → turunkan admin jadi member\n` +
      `└ 👁️ *Lihat Admin* → cek daftar admin group\n\n` +
      `⚠️ _Bot harus menjadi admin group untuk promote/demote_\n\nPilih aksi 👇`,
    footer: `© ${config.botName} | Group Admin Manager`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Aksi",
          sections: [
            {
              title: "⚙️ Aksi",
              rows: [
                {
                  header: "⬆️",
                  title: "Promote Member → Admin",
                  description: "Jadikan member sebagai admin group",
                  id: "grpadmin_promote",
                },
                {
                  header: "⬇️",
                  title: "Demote Admin → Member",
                  description: "Turunkan admin menjadi member",
                  id: "grpadmin_demote",
                },
                {
                  header: "👁️",
                  title: "Lihat Admin Group",
                  description: "Tampilkan daftar admin",
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
// 👥 PILIH GROUP
// ==========================================
async function handleGroupSelectForAction(sock, jid, senderNumber, action) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const actionLabel = {
    promote: "⬆️ Promote Member",
    demote: "⬇️ Demote Admin",
    view: "👁️ Lihat Admin",
  };
  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  const joinedGroups = await getJoinedGroups(sock);

  if (joinedGroups.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ Tidak ada group.\n\nKetik *group_manager* untuk kembali.`,
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
        header: `✅ ${memberCount} · ${adminCount} admin`,
        title: shortName,
        description: `Bot admin`,
        id: `grpselect_${action}_${g.jid}`,
      });
    } else {
      nonAdminGroupRows.push({
        header: `⚠️ ${memberCount} · Bot bukan admin`,
        title: shortName,
        description:
          action === "view" ? `Lihat saja` : `⚠️ Jadikan bot admin dulu`,
        id:
          action === "view"
            ? `grpselect_view_${g.jid}`
            : `grpnotadmin_${g.jid}`,
      });
    }
  }

  const sections = [];
  if (adminGroupRows.length > 0)
    sections.push({
      title: `✅ Bot Sudah Admin (${adminGroupRows.length})`,
      rows: adminGroupRows.slice(0, 10),
    });
  if (nonAdminGroupRows.length > 0)
    sections.push({
      title: `⚠️ Bot Bukan Admin (${nonAdminGroupRows.length})`,
      rows: nonAdminGroupRows.slice(0, 10),
    });

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
      `└ ⚠️ Bot bukan admin: *${nonAdminGroupRows.length}*\n\nPilih group 👇`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({ title: "👥 Pilih Group", sections }),
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
      `⚠️ *BOT BUKAN ADMIN GROUP*\n\n👥 *Group:* ${groupName}\n\n` +
      `❌ Bot tidak bisa promote/demote karena bukan admin.\n\n` +
      `✅ *Cara jadikan bot admin:*\n1️⃣ Buka group\n2️⃣ Info Group → Tap kontak bot\n3️⃣ Pilih *Jadikan Admin*\n\n` +
      `Setelah itu ketik *group_manager* lagi.`,
  });
}

// ==========================================
// PROMOTE: PILIH MEMBER
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
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || groupJid;
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const members = meta.participants.filter((p) => {
    if (p.admin === "admin" || p.admin === "superadmin") return false;
    if (isParticipantBot(p.id)) return false;
    return true;
  });

  if (members.length === 0) {
    await sock.sendMessage(jid, {
      text: `⚠️ Tidak ada member untuk di-promote di *${groupName}*.`,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < members.length; i += 10) {
    sections.push({
      title: `👤 Member (${i + 1}–${Math.min(i + 10, members.length)})`,
      rows: members.slice(i, i + 10).map((p) => {
        const number = jidToDigits(p.id);
        const displayName = p.notify || p.name || `+${number}`;
        return {
          header: `⬆️ Promote`,
          title: displayName,
          description: `+${number}`,
          id: `grppromote_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬆️ *PROMOTE MEMBER → ADMIN*\n\n` +
      `👥 *Group:* ${groupName}\n👤 *Member:* ${members.length} orang\n\n` +
      `💬 Atau command di group:\n\`\`\`/promote @user\`\`\`\n\nPilih member 👇`,
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
// DEMOTE: PILIH ADMIN
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

  const admins = meta.participants.filter(
    (p) => p.admin === "admin" && !isParticipantBot(p.id),
  );
  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    await sock.sendMessage(jid, {
      text: `⚠️ Tidak ada admin yang bisa di-demote di *${groupName}*.`,
    });
    return;
  }

  const sections = [];
  for (let i = 0; i < admins.length; i += 10) {
    sections.push({
      title: `🛡️ Admin (${i + 1}–${Math.min(i + 10, admins.length)})`,
      rows: admins.slice(i, i + 10).map((p) => {
        const number = jidToDigits(p.id);
        const displayName = p.notify || p.name || `+${number}`;
        return {
          header: `⬇️ Demote`,
          title: displayName,
          description: `+${number}`,
          id: `grpdemote_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬇️ *DEMOTE ADMIN → MEMBER*\n\n` +
      `👥 *Group:* ${groupName}\n🛡️ *Admin:* ${admins.length}\n👑 *Owner:* ${superAdmins.length} _(tidak bisa di-demote)_\n\n` +
      `💬 Atau command:\n\`\`\`/demote @user\`\`\`\n\nPilih admin 👇`,
    footer: `⚠️ Owner tidak bisa di-demote`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({ title: "🛡️ Pilih Admin", sections }),
      },
    ],
  });
}

// ==========================================
// VIEW ADMIN GROUP
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
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  const botP = findBotInParticipants(meta.participants);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter((p) => !p.admin);

  let text =
    `╔══════════════════════════╗\n║  👥 *INFO ADMIN GROUP*   ║\n╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n📊 *Total:* ${meta.participants.length}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n`;

  if (botP) text += `🔑 *Bot JID:* ${botP.id}\n`;
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `👑 *Owner (${superAdmins.length}):*\n`;
  superAdmins.length === 0
    ? (text += `└ _Tidak ada_\n`)
    : superAdmins.forEach((p, i) => {
        const num = jidToDigits(p.id);
        const name = p.notify || p.name || `+${num}`;
        text += `${i === superAdmins.length - 1 ? "└" : "├"} ${name}${isParticipantBot(p.id) ? " 🤖" : ""} (+${num})\n`;
      });

  text += `\n🛡️ *Admin (${admins.length}):*\n`;
  admins.length === 0
    ? (text += `└ _Tidak ada_\n`)
    : admins.forEach((p, i) => {
        const num = jidToDigits(p.id);
        const name = p.notify || p.name || `+${num}`;
        text += `${i === admins.length - 1 ? "└" : "├"} ${name}${isParticipantBot(p.id) ? " 🤖" : ""} (+${num})\n`;
      });

  text += `\n👤 *Member:* ${members.length} orang\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nKetik *group_manager* untuk kembali.`;
  await sock.sendMessage(jid, { text });
}

// ==========================================
// ✅ EXECUTE PROMOTE (dari list button)
// ==========================================
async function executeGroupPromote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetDigits = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mempromote anggota...*` });

  const result = await executeParticipantUpdate(
    sock,
    groupJid,
    targetJid,
    "promote",
  );

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  const groupName = meta?.subject || groupJid;
  const phoneDigits = jidToDigits(result.usedJid || targetJid);
  const updatedP = (meta?.participants || []).find(
    (p) =>
      jidToDigits(p.id) === phoneDigits || jidToDigits(p.id) === targetDigits,
  );
  const displayName = updatedP?.notify || updatedP?.name || `+${targetDigits}`;

  if (result.success) {
    console.log(
      `⬆️ Promote OK: ${displayName} @ ${groupName} [${result.label}]`,
    );
    await sock.sendMessage(jid, {
      text:
        `⬆️ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *Member:* @${phoneDigits}\n` +
        `🏷️ *Nama:* ${displayName}\n` +
        `🔄 Member → 🛡️ Admin\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: [result.usedJid || targetJid],
    });
  } else {
    let errMsg = result.error || "Gagal";
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant"))
      errMsg = "User bukan anggota group.";
    console.error(`❌ Promote failed: ${displayName} → ${errMsg}`);
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL PROMOTE*\n\n👤 ${displayName}\n📛 ${errMsg}`,
    });
  }
}

// ==========================================
// ✅ EXECUTE DEMOTE (dari list button)
// ==========================================
async function executeGroupDemote(
  sock,
  jid,
  senderNumber,
  groupJid,
  targetJid,
) {
  if (!isAdminOrOwner(senderNumber)) return;

  const targetDigits = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mendemote admin...*` });

  const result = await executeParticipantUpdate(
    sock,
    groupJid,
    targetJid,
    "demote",
  );

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  const groupName = meta?.subject || groupJid;
  const phoneDigits = jidToDigits(result.usedJid || targetJid);
  const updatedP = (meta?.participants || []).find(
    (p) =>
      jidToDigits(p.id) === phoneDigits || jidToDigits(p.id) === targetDigits,
  );
  const displayName = updatedP?.notify || updatedP?.name || `+${targetDigits}`;

  if (result.success) {
    console.log(
      `⬇️ Demote OK: ${displayName} @ ${groupName} [${result.label}]`,
    );
    await sock.sendMessage(jid, {
      text:
        `⬇️ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *Admin:* @${phoneDigits}\n` +
        `🏷️ *Nama:* ${displayName}\n` +
        `🔄 🛡️ Admin → Member\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: [result.usedJid || targetJid],
    });
  } else {
    let errMsg = result.error || "Gagal";
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "Bukan anggota group.";
    console.error(`❌ Demote failed: ${displayName} → ${errMsg}`);
    await sock.sendMessage(jid, {
      text: `❌ *GAGAL DEMOTE*\n\n👤 ${displayName}\n📛 ${errMsg}`,
    });
  }
}

// ==========================================
// ✅ COMMAND /promote @user
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: `❌ Hanya bisa di *group*.` });
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
    await sock.sendMessage(jid, { text: `❌ Format: \`/promote @user\`` });
    return;
  }

  const meta = await sock.groupMetadata(jid).catch(() => null);
  const results = [];
  const mentionJidsForTag = [];

  for (const mentionJid of mentions) {
    const mentionDigits = jidToDigits(mentionJid);

    // Cari nama dari metadata
    const p = (meta?.participants || []).find(
      (x) => jidToDigits(x.id) === mentionDigits,
    );
    const displayName = p?.notify || p?.name || `+${mentionDigits}`;

    // ✅ Gunakan executeParticipantUpdate dengan retry
    const result = await executeParticipantUpdate(
      sock,
      jid,
      mentionJid,
      "promote",
    );
    const usedJid = result.usedJid || mentionJid;
    const usedDigits = jidToDigits(usedJid);

    mentionJidsForTag.push(usedJid);

    if (result.success) {
      results.push(`✅ @${usedDigits} *(${displayName})* → 🛡️ Admin`);
      console.log(`⬆️ Promote OK: ${displayName} [${result.label}]`);
    } else {
      let e = result.error || "Gagal";
      if (e.includes("not-authorized")) e = "Bot bukan admin";
      if (e.includes("not-participant")) e = "Bukan anggota group";
      if (e.includes("forbidden")) e = "Tidak diizinkan";
      if (e.includes("internal-server-error")) e = "Server error — coba lagi";
      results.push(`❌ @${usedDigits} *(${displayName})* → ${e}`);
      console.error(`❌ Promote failed: ${displayName} → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text: `⬆️ *HASIL PROMOTE*\n\n${results.join("\n")}\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: mentionJidsForTag,
    },
    { quoted: msg },
  );
}

// ==========================================
// ✅ COMMAND /demote @user
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: `❌ Hanya bisa di *group*.` });
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
    await sock.sendMessage(jid, { text: `❌ Format: \`/demote @user\`` });
    return;
  }

  const meta = await sock.groupMetadata(jid).catch(() => null);
  const results = [];
  const mentionJidsForTag = [];

  for (const mentionJid of mentions) {
    const mentionDigits = jidToDigits(mentionJid);

    const p = (meta?.participants || []).find(
      (x) => jidToDigits(x.id) === mentionDigits,
    );
    const displayName = p?.notify || p?.name || `+${mentionDigits}`;

    // ✅ Gunakan executeParticipantUpdate dengan retry
    const result = await executeParticipantUpdate(
      sock,
      jid,
      mentionJid,
      "demote",
    );
    const usedJid = result.usedJid || mentionJid;
    const usedDigits = jidToDigits(usedJid);

    mentionJidsForTag.push(usedJid);

    if (result.success) {
      results.push(`✅ @${usedDigits} *(${displayName})* → 👤 Member`);
      console.log(`⬇️ Demote OK: ${displayName} [${result.label}]`);
    } else {
      let e = result.error || "Gagal";
      if (e.includes("not-authorized")) e = "Bot bukan admin";
      if (e.includes("not-participant")) e = "Bukan anggota group";
      if (e.includes("forbidden")) e = "Tidak diizinkan";
      if (e.includes("internal-server-error")) e = "Server error — coba lagi";
      results.push(`❌ @${usedDigits} *(${displayName})* → ${e}`);
      console.error(`❌ Demote failed: ${displayName} → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text: `⬇️ *HASIL DEMOTE*\n\n${results.join("\n")}\n\n⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: mentionJidsForTag,
    },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAdminOrOwner(senderNumber)) return;

  if (rawId.startsWith("grpnotadmin_")) {
    await handleBotNotAdmin(
      sock,
      jid,
      senderNumber,
      rawId.replace("grpnotadmin_", ""),
    );
    return;
  }

  if (rawId.startsWith("grpselect_")) {
    const without = rawId.replace("grpselect_", "");
    const idx = without.indexOf("_");
    if (idx === -1) return;
    const action = without.substring(0, idx);
    const groupJid = without.substring(idx + 1);
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
    await executeGroupPromote(
      sock,
      jid,
      senderNumber,
      without.substring(0, sep),
      without.substring(sep + 2),
    );
    return;
  }

  if (rawId.startsWith("grpdemote_")) {
    const without = rawId.replace("grpdemote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    await executeGroupDemote(
      sock,
      jid,
      senderNumber,
      without.substring(0, sep),
      without.substring(sep + 2),
    );
    return;
  }
}

// ==========================================
// ADMIN MENU SECTION
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
  handleAddAdmin,
  handleDelAdmin,
  handleDelAdminFromList,
  handleAdminListOrders,
  handleEditBanner,
  handleIncomingImage,
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,
  handlePromoteCommand,
  handleDemoteCommand,
  sendAdminList,
  sendAdminDeleteList,
  getAdminMenuSection,
  loadAdmins,
  saveAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  normalizeNumber,
  getNumberFromJid,
  cleanNumber,
  jidToDigits,
  setBotRuntimeInfo,
  isParticipantBot,
  findBotInParticipants,
  registerLidPhoneMapping,
  BOT_LID_LIST,
};
