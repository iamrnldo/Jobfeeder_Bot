// ==========================================
//  HANDLER_ADMIN_GROUP.JS
//  Khusus: Group Admin Manager
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  isOwner,
  isAdminBot,
  jidToDigits,
  normalizeNumber,
} = require("./handler_owner");

const BANNER_PATH = path.join(__dirname, "images", "menu", "banner_menu.jpg");

// ==========================================
// BOT LID REGISTRY
// ==========================================
const BOT_LID_LIST = ["127569823277085"];

let runtimeBotPhone = null;
let runtimeBotLid = null;

// ==========================================
// SET RUNTIME BOT INFO
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
    } else {
      console.log(`💾 Bot LID confirmed: "${runtimeBotLid}"`);
    }
  }

  console.log(`📋 BOT_LID_LIST: [${BOT_LID_LIST.join(", ")}]`);
}

// ==========================================
// IS PARTICIPANT BOT?
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

  if (pDomain !== "lid" && runtimeBotPhone && pDigits === runtimeBotPhone) {
    return true;
  }

  if (
    pDomain !== "lid" &&
    runtimeBotPhone &&
    pDigits.length >= 8 &&
    runtimeBotPhone.length >= 8 &&
    pDigits.slice(-8) === runtimeBotPhone.slice(-8)
  ) {
    return true;
  }

  return false;
}

// ==========================================
// FIND BOT IN PARTICIPANTS
// ==========================================
function findBotInParticipants(participants) {
  if (!participants || participants.length === 0) return null;
  for (const p of participants) {
    if (isParticipantBot(p.id)) return p;
  }
  return null;
}

// ==========================================
// CEK BOT ADMIN DI GROUP
// ==========================================
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    let botP = findBotInParticipants(meta.participants);

    if (!botP) {
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const cached = allGroups[groupJid];
        if (cached?.participants) {
          botP = findBotInParticipants(cached.participants);
        }
      } catch (e) {}
    }

    if (!botP) return false;
    return botP.admin === "admin" || botP.admin === "superadmin";
  } catch (err) {
    console.error(`❌ isBotAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ MATCH PARTICIPANT JID vs SENDER NUMBER
//
// Masalah: participant.id bisa dalam format:
//   "628xxx@s.whatsapp.net"          → phone normal
//   "628xxx:12@s.whatsapp.net"       → multi-device
//   "38650712698961:0@lid"           → LID format
//   "169217970184326:0@lid"          → LID lain
//
// senderNumber dari handler.js sudah clean (tanpa :suffix)
// tapi participant.id mungkin masih ada :suffix
// ==========================================
function matchParticipant(participantJid, senderNumber) {
  if (!participantJid || !senderNumber) return false;

  const pDomain = (participantJid.split("@")[1] || "").toLowerCase();

  // ── Skip LID domain ──────────────────────
  // LID tidak bisa dicocokkan langsung dengan nomor telepon
  if (pDomain === "lid") return false;

  // ── Ekstrak digit bersih dari participant ─
  const pDigits = jidToDigits(participantJid); // tanpa :suffix, tanpa domain
  const sDigits = normalizeNumber(senderNumber); // hanya digit

  if (!pDigits || !sDigits) return false;

  // Exact match
  if (pDigits === sDigits) return true;

  // Suffix match 8 digit (toleran perbedaan kode negara)
  if (
    pDigits.length >= 8 &&
    sDigits.length >= 8 &&
    pDigits.slice(-8) === sDigits.slice(-8)
  ) {
    return true;
  }

  return false;
}

// ==========================================
// ✅ CEK: SENDER ADMIN DI GROUP INI?
// Real-time dari groupMetadata
// ==========================================
async function isSenderAdminInGroup(sock, groupJid, senderNumber) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const sDigits = normalizeNumber(senderNumber);

    console.log(
      `🔍 isSenderAdminInGroup: group="${meta.subject}" ` +
        `sender="${sDigits}" participants=${meta.participants.length}`,
    );

    for (const p of meta.participants) {
      const match = matchParticipant(p.id, senderNumber);

      if (match) {
        const isAdm = p.admin === "admin" || p.admin === "superadmin";
        console.log(
          `   ✅ Match: "${p.id}" → admin=${isAdm} (${p.admin || "none"})`,
        );
        return isAdm;
      }
    }

    console.log(`   ❌ Sender tidak ditemukan di group "${meta.subject}"`);
    return false;
  } catch (err) {
    console.error(`❌ isSenderAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ CEK: SENDER ADMIN DI SALAH SATU GROUP?
// Dipakai untuk cek akses group_manager
// dari private chat
// ==========================================
async function isSenderAdminInAnyGroup(sock, senderNumber) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    const sDigits = normalizeNumber(senderNumber);

    console.log(
      `🔍 isSenderAdminInAnyGroup: sender="${sDigits}" ` +
        `checking ${groupList.length} groups...`,
    );

    for (const g of groupList) {
      let participants = g.participants || [];

      // Ambil fresh metadata
      try {
        const fresh = await sock.groupMetadata(g.id);
        participants = fresh.participants || participants;
      } catch (e) {}

      for (const p of participants) {
        const match = matchParticipant(p.id, senderNumber);

        if (match) {
          const isAdm = p.admin === "admin" || p.admin === "superadmin";

          console.log(
            `   [${isAdm ? "✅ ADMIN" : "   member"}] ` +
              `group="${g.subject}" jid="${p.id}" admin=${p.admin || "none"}`,
          );

          if (isAdm) {
            console.log(
              `   ✅ Sender +${senderNumber} adalah admin ` +
                `di group "${g.subject}"`,
            );
            return true;
          }
          // Ketemu di group ini tapi bukan admin → lanjut ke group lain
          break;
        }
      }
    }

    console.log(`   ❌ Sender +${senderNumber} bukan admin di manapun`);
    return false;
  } catch (err) {
    console.error(`❌ isSenderAdminInAnyGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// ✅ CEK AKSES GROUP MANAGER
// ==========================================
async function canAccessGroupManager(sock, senderNumber) {
  // Cek sync dulu (cepat)
  if (isOwner(senderNumber)) {
    console.log(`🔐 canAccessGroupManager: +${senderNumber} → OWNER ✅`);
    return true;
  }
  if (isAdminBot(senderNumber)) {
    console.log(`🔐 canAccessGroupManager: +${senderNumber} → ADMIN BOT ✅`);
    return true;
  }

  // Cek async (perlu API call ke WA)
  console.log(`🔐 canAccessGroupManager: +${senderNumber} → cek group WA...`);
  const isGroupAdmin = await isSenderAdminInAnyGroup(sock, senderNumber);
  console.log(
    `🔐 canAccessGroupManager: +${senderNumber} → ` +
      `isGroupAdmin=${isGroupAdmin}`,
  );
  return isGroupAdmin;
}

// ==========================================
// GET JOINED GROUPS
// ==========================================
async function getJoinedGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    const result = [];

    for (const g of groupList) {
      let participants = g.participants || [];
      let groupName = g.subject || "Unknown Group";
      let botIsAdmin = false;

      try {
        const freshMeta = await sock.groupMetadata(g.id);
        participants = freshMeta.participants || [];
        groupName = freshMeta.subject || groupName;
      } catch (e) {}

      const botP = findBotInParticipants(participants);
      if (botP) {
        botIsAdmin = botP.admin === "admin" || botP.admin === "superadmin";
      }

      result.push({ jid: g.id, name: groupName, participants, botIsAdmin });
    }

    return result;
  } catch (err) {
    console.error(`❌ getJoinedGroups error: ${err.message}`);
    return [];
  }
}

// ==========================================
// GET JOINED GROUPS FOR SENDER
// Owner/AdminBot → semua group
// AdminGroup WA  → hanya group tempat dia admin
// ==========================================
async function getJoinedGroupsForSender(sock, senderNumber) {
  const allGroups = await getJoinedGroups(sock);

  if (isOwner(senderNumber) || isAdminBot(senderNumber)) {
    return allGroups;
  }

  // Filter: hanya group tempat sender jadi admin
  return allGroups.filter((g) => {
    for (const p of g.participants) {
      if (matchParticipant(p.id, senderNumber)) {
        return p.admin === "admin" || p.admin === "superadmin";
      }
    }
    return false;
  });
}

// ==========================================
// HELPER: DISPLAY NAME
// ==========================================
function getDisplayName(participant) {
  if (!participant) return "Unknown";

  const name =
    participant.notify || participant.name || participant.verifiedName || null;

  if (name && name.trim()) return name.trim();

  const number = jidToDigits(participant.id);
  return number ? `+${number}` : "Unknown";
}

// ==========================================
// ADMIN GROUP PANEL MENU SECTION
// ==========================================
function getAdminGroupMenuSection() {
  const bannerExists = fs.existsSync(BANNER_PATH);

  return {
    title: "👥 Panel Admin Group",
    highlight_label: "Admin Group",
    rows: [
      {
        header: "⬆️",
        title: "Promote Member → Admin",
        description: "Jadikan member menjadi admin group",
        id: "grpadmin_promote",
      },
      {
        header: "⬇️",
        title: "Demote Admin → Member",
        description: "Turunkan admin group menjadi member",
        id: "grpadmin_demote",
      },
      {
        header: "👁️",
        title: "Lihat Admin Group",
        description: "Tampilkan daftar admin di group",
        id: "grpadmin_view",
      },
      {
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner (sudah ada)"
          : "Upload banner (belum ada)",
        id: "grpadmin_banner",
      },
    ],
  };
}

// ==========================================
// GROUP MANAGER — MENU UTAMA
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  const hasAccess = await canAccessGroupManager(sock, senderNumber);

  if (!hasAccess) {
    await sock.sendMessage(jid, {
      text:
        `⛔ *AKSES DITOLAK*\n\n` +
        `Fitur ini hanya untuk:\n` +
        `├ 👑 Owner bot\n` +
        `├ 🛡️ Admin bot\n` +
        `└ 👥 Admin di group WhatsApp\n\n` +
        `Pastikan kamu menjadi admin\n` +
        `di salah satu group bot.`,
    });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data group...*` });

  const joinedGroups = await getJoinedGroupsForSender(sock, senderNumber);
  const adminCount = joinedGroups.filter((g) => g.botIsAdmin).length;
  const nonAdminCount = joinedGroups.filter((g) => !g.botIsAdmin).length;

  const roleLabel = isOwner(senderNumber)
    ? "👑 Owner"
    : isAdminBot(senderNumber)
      ? "🛡️ Admin Bot"
      : "👥 Admin Group";

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👥 *GROUP ADMIN MANAGER*║\n` +
      `╚══════════════════════════╝\n\n` +
      `🔑 *Role kamu:* ${roleLabel}\n\n` +
      `📊 *Group yang bisa dikelola:*\n` +
      `├ 👥 Total: ${joinedGroups.length} group\n` +
      `├ ✅ Bot admin: ${adminCount} group\n` +
      `└ ⚠️ Bot bukan admin: ${nonAdminCount} group\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Pilih aksi:*\n` +
      `├ ⬆️ *Promote* → member jadi admin\n` +
      `├ ⬇️ *Demote* → admin jadi member\n` +
      `└ 👁️ *Lihat* → daftar admin group\n\n` +
      `⚠️ _Bot harus admin group untuk promote/demote_`,
    footer: `© ${config.botName} | Group Manager`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Aksi",
          sections: [
            {
              title: "⚙️ Aksi Group",
              rows: [
                {
                  header: "⬆️",
                  title: "Promote Member → Admin",
                  description: "Jadikan member biasa sebagai admin group",
                  id: "grpadmin_promote",
                },
                {
                  header: "⬇️",
                  title: "Demote Admin → Member",
                  description: "Turunkan admin group menjadi member biasa",
                  id: "grpadmin_demote",
                },
                {
                  header: "👁️",
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
// PILIH GROUP UNTUK AKSI
// ==========================================
async function handleGroupSelectForAction(sock, jid, senderNumber, action) {
  const hasAccess = await canAccessGroupManager(sock, senderNumber);

  if (!hasAccess) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const actionLabel = {
    promote: "⬆️ Promote Member",
    demote: "⬇️ Demote Admin",
    view: "👁️ Lihat Admin Group",
  };

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  const joinedGroups = await getJoinedGroupsForSender(sock, senderNumber);

  if (joinedGroups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Tidak ada group yang bisa dikelola.*\n\n` +
        `Pastikan kamu menjadi admin\n` +
        `di salah satu group bot.\n\n` +
        `Ketik *group_manager* untuk kembali.`,
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
        description: `Bot admin`,
        id: `grpselect_${action}_${g.jid}`,
      });
    } else {
      nonAdminGroupRows.push({
        header: `⚠️ ${memberCount} anggota · Bot bukan admin`,
        title: shortName,
        description:
          action === "view" ? `Lihat saja` : `⚠️ Bot perlu jadi admin dulu`,
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
        title: `✅ Bot Admin (${adminGroupRows.length})`,
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

  await sock.sendMessage(jid, {
    text:
      `👥 *${actionLabel[action]}*\n\n` +
      `Group yang bisa dikelola: *${joinedGroups.length}*\n` +
      `├ ✅ Bot admin: *${adminGroupRows.length}*\n` +
      `└ ⚠️ Bukan admin: *${nonAdminGroupRows.length}*\n\n` +
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
  let groupName = "Group";
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupName = meta?.subject || "Group";
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
      `Lalu ketik *group_manager* lagi.`,
  });
}

// ==========================================
// VALIDASI AKSES KE GROUP SPESIFIK
// ==========================================
async function validateGroupAccess(sock, jid, senderNumber, groupJid) {
  if (isOwner(senderNumber) || isAdminBot(senderNumber)) return true;

  const isAdminHere = await isSenderAdminInGroup(sock, groupJid, senderNumber);
  if (!isAdminHere) {
    await sock.sendMessage(jid, {
      text:
        `⛔ *AKSES DITOLAK*\n\n` +
        `Kamu bukan admin di group ini.\n\n` +
        `Kamu hanya bisa mengelola group\n` +
        `tempat kamu menjadi admin.`,
    });
    return false;
  }

  return true;
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
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data member...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || "Group";
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
      rows: chunk.map((p) => ({
        header: `⬆️ Promote`,
        title: getDisplayName(p),
        description: `+${jidToDigits(p.id)}`,
        id: `grppromote_${groupJid}__${p.id}`,
      })),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬆️ *PROMOTE MEMBER → ADMIN*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `👤 *Member:* ${members.length} orang\n` +
      `🛡️ *Admin:* ${adminCount} orang\n\n` +
      `Command: \`/promote @user\`\n\n` +
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
// DEMOTE: PILIH ADMIN
// ==========================================
async function handleGroupSelectedForDemote(sock, jid, senderNumber, groupJid) {
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil data admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || "Group";
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const admins = meta.participants.filter((p) => {
    if (p.admin !== "admin") return false;
    if (isParticipantBot(p.id)) return false;
    return true;
  });

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");

  if (admins.length === 0) {
    const superList =
      superAdmins.length > 0
        ? `\n\n👑 *Owner (tidak bisa di-demote):*\n` +
          superAdmins.map((p) => `└ ${getDisplayName(p)}`).join("\n")
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
      rows: chunk.map((p) => ({
        header: `⬇️ Demote`,
        title: getDisplayName(p),
        description: `+${jidToDigits(p.id)}`,
        id: `grpdemote_${groupJid}__${p.id}`,
      })),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `⬇️ *DEMOTE ADMIN → MEMBER*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `🛡️ *Admin:* ${admins.length} orang\n` +
      `👑 *Owner:* ${superAdmins.length} orang _(tidak bisa di-demote)_\n\n` +
      `Command: \`/demote @user\`\n\n` +
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
// VIEW: INFO ADMIN GROUP
// ==========================================
async function handleGroupViewAdmins(sock, jid, senderNumber, groupJid) {
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar admin...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || "Group";
  const totalMembers = meta.participants.length;
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  const superAdmins = meta.participants.filter((p) => p.admin === "superadmin");
  const admins = meta.participants.filter((p) => p.admin === "admin");
  const members = meta.participants.filter(
    (p) => p.admin !== "admin" && p.admin !== "superadmin",
  );

  const allAdminJids = [
    ...superAdmins.map((p) => p.id),
    ...admins.map((p) => p.id),
  ];

  let text =
    `╔══════════════════════════╗\n` +
    `║  👥 *INFO ADMIN GROUP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `📊 *Total anggota:* ${totalMembers}\n` +
    `🤖 *Status bot:* ${botIsAdmin ? "✅ Admin" : "⚠️ Bukan admin"}\n` +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  text += `👑 *Owner Group (${superAdmins.length}):*\n`;
  if (superAdmins.length === 0) {
    text += `└ _Tidak ada_\n`;
  } else {
    superAdmins.forEach((p, i) => {
      const isBot = isParticipantBot(p.id);
      const number = jidToDigits(p.id);
      const prefix = i === superAdmins.length - 1 ? "└" : "├";
      text += `${prefix} @${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text += `\n🛡️ *Admin Group (${admins.length}):*\n`;
  if (admins.length === 0) {
    text += `└ _Tidak ada admin tambahan_\n`;
  } else {
    admins.forEach((p, i) => {
      const isBot = isParticipantBot(p.id);
      const number = jidToDigits(p.id);
      const prefix = i === admins.length - 1 ? "└" : "├";
      text += `${prefix} @${number}${isBot ? " 🤖" : ""}\n`;
    });
  }

  text +=
    `\n👤 *Member Biasa:* ${members.length} orang\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Ketik *group_manager* untuk kembali.`;

  await sock.sendMessage(jid, {
    text,
    mentions: allAdminJids,
  });
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
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  const targetNumber = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mempromote...*` });

  try {
    const metaBefore = await sock.groupMetadata(groupJid).catch(() => null);
    const pBefore = metaBefore?.participants?.find((p) => p.id === targetJid);
    const displayName = pBefore ? getDisplayName(pBefore) : `+${targetNumber}`;

    await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");

    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || "Group";

    console.log(`⬆️ Promote OK: ${displayName} @ ${groupName}`);

    await sock.sendMessage(jid, {
      text:
        `✅ *PROMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* @${targetNumber}\n` +
        `📛 *Nama:* ${displayName}\n` +
        `🔄 Member → 🛡️ Admin\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: [targetJid],
    });
  } catch (err) {
    console.error(`❌ Promote failed: ${err.message}`);
    let errMsg = err.message;
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "User bukan anggota.";

    await sock.sendMessage(jid, {
      text: `❌ *GAGAL PROMOTE*\n\n👤 @${targetNumber}\nError: ${errMsg}`,
      mentions: [targetJid],
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
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  const targetNumber = jidToDigits(targetJid);
  await sock.sendMessage(jid, { text: `⏳ *Mendemote...*` });

  try {
    const metaBefore = await sock.groupMetadata(groupJid).catch(() => null);
    const pBefore = metaBefore?.participants?.find((p) => p.id === targetJid);

    if (pBefore?.admin === "superadmin") {
      await sock.sendMessage(jid, {
        text:
          `⛔ *TIDAK BISA DEMOTE OWNER GROUP*\n\n` +
          `👤 ${getDisplayName(pBefore)} adalah Owner group.\n` +
          `Owner group tidak bisa di-demote.`,
      });
      return;
    }

    const displayName = pBefore ? getDisplayName(pBefore) : `+${targetNumber}`;

    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");

    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || "Group";

    console.log(`⬇️ Demote OK: ${displayName} @ ${groupName}`);

    await sock.sendMessage(jid, {
      text:
        `✅ *DEMOTE BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* @${targetNumber}\n` +
        `📛 *Nama:* ${displayName}\n` +
        `🔄 🛡️ Admin → Member\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: [targetJid],
    });
  } catch (err) {
    console.error(`❌ Demote failed: ${err.message}`);
    let errMsg = err.message;
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "Bukan anggota.";

    await sock.sendMessage(jid, {
      text: `❌ *GAGAL DEMOTE*\n\n👤 @${targetNumber}\nError: ${errMsg}`,
      mentions: [targetJid],
    });
  }
}

// ==========================================
// COMMAND /promote @user (di dalam group)
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
    });
    return;
  }

  // Cek akses: owner/admin bot OR admin di group ini
  const isAllowed =
    isOwner(senderNumber) ||
    isAdminBot(senderNumber) ||
    (await isSenderAdminInGroup(sock, jid, senderNumber));

  if (!isAllowed) {
    await sock.sendMessage(jid, {
      text: `⛔ *AKSES DITOLAK*\n\nHanya admin group yang bisa promote.`,
    });
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

  const meta = await sock.groupMetadata(jid).catch(() => null);
  const results = [];

  for (const targetJid of mentions) {
    const number = jidToDigits(targetJid);
    const participant = meta?.participants?.find((p) => p.id === targetJid);
    const displayName = participant
      ? getDisplayName(participant)
      : `+${number}`;

    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "promote");
      results.push(`✅ @${number} (${displayName}) → 🛡️ Admin`);
      console.log(`⬆️ Promote cmd: ${displayName} oleh +${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    { text: `⬆️ *HASIL PROMOTE*\n\n${results.join("\n")}`, mentions },
    { quoted: msg },
  );
}

// ==========================================
// COMMAND /demote @user (di dalam group)
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
    });
    return;
  }

  const isAllowed =
    isOwner(senderNumber) ||
    isAdminBot(senderNumber) ||
    (await isSenderAdminInGroup(sock, jid, senderNumber));

  if (!isAllowed) {
    await sock.sendMessage(jid, {
      text: `⛔ *AKSES DITOLAK*\n\nHanya admin group yang bisa demote.`,
    });
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

  const meta = await sock.groupMetadata(jid).catch(() => null);
  const results = [];

  for (const targetJid of mentions) {
    const number = jidToDigits(targetJid);
    const participant = meta?.participants?.find((p) => p.id === targetJid);
    const displayName = participant
      ? getDisplayName(participant)
      : `+${number}`;

    if (participant?.admin === "superadmin") {
      results.push(
        `⛔ @${number} (${displayName}) → Owner group, tidak bisa di-demote`,
      );
      continue;
    }

    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "demote");
      results.push(`✅ @${number} (${displayName}) → 👤 Member`);
      console.log(`⬇️ Demote cmd: ${displayName} oleh +${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    { text: `⬇️ *HASIL DEMOTE*\n\n${results.join("\n")}`, mentions },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  const hasAccess = await canAccessGroupManager(sock, senderNumber);
  if (!hasAccess) return;

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

  if (rawId === "grpadmin_banner") {
    const { handleEditBanner } = require("./handler_admin");
    await handleEditBanner(sock, jid, senderNumber);
    return;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Panel
  getAdminGroupMenuSection,
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,

  // Commands
  handlePromoteCommand,
  handleDemoteCommand,

  // Checks
  canAccessGroupManager,
  isSenderAdminInGroup,
  isSenderAdminInAnyGroup,

  // Bot identity
  setBotRuntimeInfo,
  isParticipantBot,
  findBotInParticipants,
  BOT_LID_LIST,
};
