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
// MATCH PARTICIPANT JID vs SENDER NUMBER
// ==========================================
function matchParticipant(participantJid, senderNumber) {
  if (!participantJid || !senderNumber) return false;

  const pDomain = (participantJid.split("@")[1] || "").toLowerCase();
  if (pDomain === "lid") return false;

  const pDigits = jidToDigits(participantJid);
  const sDigits = normalizeNumber(senderNumber);

  if (!pDigits || !sDigits) return false;
  if (pDigits === sDigits) return true;

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
// CEK: SENDER ADMIN DI GROUP INI?
// ==========================================
async function isSenderAdminInGroup(sock, groupJid, senderNumber) {
  try {
    const meta = await sock.groupMetadata(groupJid);

    for (const p of meta.participants) {
      const match = matchParticipant(p.id, senderNumber);
      if (match) {
        const isAdm = p.admin === "admin" || p.admin === "superadmin";
        return isAdm;
      }
    }

    return false;
  } catch (err) {
    console.error(`❌ isSenderAdminInGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// CEK: SENDER ADMIN DI SALAH SATU GROUP?
// ==========================================
async function isSenderAdminInAnyGroup(sock, senderNumber) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    for (const g of groupList) {
      let participants = g.participants || [];

      try {
        const fresh = await sock.groupMetadata(g.id);
        participants = fresh.participants || participants;
      } catch (e) {}

      for (const p of participants) {
        const match = matchParticipant(p.id, senderNumber);
        if (match) {
          const isAdm = p.admin === "admin" || p.admin === "superadmin";
          if (isAdm) return true;
          break;
        }
      }
    }

    return false;
  } catch (err) {
    console.error(`❌ isSenderAdminInAnyGroup error: ${err.message}`);
    return false;
  }
}

// ==========================================
// CEK AKSES GROUP MANAGER
// ==========================================
async function canAccessGroupManager(sock, senderNumber) {
  if (isOwner(senderNumber)) return true;
  if (isAdminBot(senderNumber)) return true;
  const isGroupAdmin = await isSenderAdminInAnyGroup(sock, senderNumber);
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
// ==========================================
async function getJoinedGroupsForSender(sock, senderNumber) {
  const allGroups = await getJoinedGroups(sock);

  if (isOwner(senderNumber) || isAdminBot(senderNumber)) {
    return allGroups;
  }

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
// NORMALIZE JID
// ==========================================
function normalizeToJid(input) {
  const digits = String(input).replace(/[^0-9]/g, "");
  if (!digits || digits.length < 8) return null;
  return `${digits}@s.whatsapp.net`;
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
        header: "➕",
        title: "Tambah Anggota",
        description: "Tambah anggota baru ke group",
        id: "grpadmin_add_member",
      },
      {
        header: "🚫",
        title: "Kick/Ban Anggota",
        description: "Keluarkan anggota dari group",
        id: "grpadmin_kick_member",
      },
      {
        header: "🖼️",
        title: "Edit Banner Menu",
        description: bannerExists
          ? "Ganti banner (sudah ada)"
          : "Upload banner",
        id: "grpadmin_banner",
      },
    ],
  };
}

// ==========================================
// STATE: Waiting add member input
// key: senderNumber → { jid, groupJid, groupName, timestamp }
// ==========================================
const addMemberState = new Map();

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
      `📋 *Pilih aksi:*`,
    footer: `© ${config.botName} | Group Manager`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Aksi",
          sections: [
            {
              title: "⚙️ Manajemen Admin",
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
            {
              title: "⚙️ Manajemen Anggota",
              rows: [
                {
                  header: "➕",
                  title: "Tambah Anggota",
                  description: "Tambah anggota baru ke group",
                  id: "grpadmin_add_member",
                },
                {
                  header: "🚫",
                  title: "Kick/Ban Anggota",
                  description: "Keluarkan anggota dari group",
                  id: "grpadmin_kick_member",
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
    add_member: "➕ Tambah Anggota",
    kick_member: "🚫 Kick/Ban Anggota",
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
      `👥 *${actionLabel[action] || action}*\n\n` +
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
      `❌ Bot tidak bisa promote/demote/kick/add.\n\n` +
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

  await sock.sendMessage(jid, { text, mentions: allAdminJids });
}

// ==========================================
// ADD MEMBER: PILIH GROUP
// ==========================================
async function handleGroupSelectForAddMember(sock, jid, senderNumber) {
  const valid = await canAccessGroupManager(sock, senderNumber);
  if (!valid) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  const joinedGroups = await getJoinedGroupsForSender(sock, senderNumber);
  const adminGroups = joinedGroups.filter((g) => g.botIsAdmin);

  if (adminGroups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Tidak ada group yang bisa dikelola.*\n\n` +
        `Bot harus menjadi admin group\n` +
        `untuk bisa menambah anggota.`,
    });
    return;
  }

  const rows = adminGroups.slice(0, 10).map((g) => {
    const memberCount = g.participants.length;
    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;
    return {
      header: `✅ ${memberCount} anggota`,
      title: shortName,
      description: `Tambah anggota ke group ini`,
      id: `grpaddmember_${g.jid}`,
    };
  });

  await sock.sendMessage(jid, {
    text:
      `➕ *TAMBAH ANGGOTA GROUP*\n\n` +
      `Pilih group tujuan:\n` +
      `Total: *${adminGroups.length}* group\n\n` +
      `⚠️ _Hanya group dimana bot adalah admin_`,
    footer: "Pilih group",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Group",
          sections: [{ title: "✅ Group (Bot Admin)", rows }],
        }),
      },
    ],
  });
}

// ==========================================
// ADD MEMBER: TAMPILKAN INSTRUKSI INPUT NOMOR
// ==========================================
async function handleGroupAddMemberInput(sock, jid, senderNumber, groupJid) {
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  const groupName = meta?.subject || "Group";

  // Set state: waiting for number input
  addMemberState.set(senderNumber, {
    jid,
    groupJid,
    groupName,
    timestamp: Date.now(),
  });

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ➕ *TAMBAH ANGGOTA*     ║\n` +
      `╚══════════════════════════╝\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `📊 *Anggota saat ini:* ${meta?.participants?.length || 0}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 *Ketik nomor HP yang ingin ditambahkan:*\n\n` +
      `Format satu nomor:\n` +
      `\`\`\`628xxxxxxxxxx\`\`\`\n\n` +
      `Format banyak nomor (pisah koma):\n` +
      `\`\`\`628xxx, 628yyy, 628zzz\`\`\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ _Mode input aktif 5 menit_\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });

  // Auto-expire state setelah 5 menit
  setTimeout(
    () => {
      const state = addMemberState.get(senderNumber);
      if (state?.groupJid === groupJid) {
        addMemberState.delete(senderNumber);
        sock
          .sendMessage(jid, {
            text: `⏰ *Mode tambah anggota habis waktu.*\n\nKetik *group_manager* untuk mulai lagi.`,
          })
          .catch(() => {});
      }
    },
    5 * 60 * 1000,
  );
}

// ==========================================
// ADD MEMBER: PROSES INPUT NOMOR
// Dipanggil dari handler.js saat ada text masuk
// dan addMemberState aktif untuk sender
// ==========================================
async function handleAddMemberTextInput(sock, msg, jid, senderNumber, rawText) {
  const state = addMemberState.get(senderNumber);
  if (!state) return false;

  // Cek timeout
  if (Date.now() - state.timestamp > 5 * 60 * 1000) {
    addMemberState.delete(senderNumber);
    return false;
  }

  const textLower = rawText.toLowerCase().trim();

  // Batal
  if (textLower === "batal" || textLower === "cancel") {
    addMemberState.delete(senderNumber);
    await sock.sendMessage(jid, {
      text: `❌ *Tambah anggota dibatalkan.*\n\nKetik *group_manager* untuk kembali.`,
    });
    return true;
  }

  // Parse nomor-nomor
  const rawNumbers = rawText
    .split(/[,\n\s]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const validJids = [];
  const invalidNumbers = [];

  for (const raw of rawNumbers) {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      invalidNumbers.push(raw);
      continue;
    }
    // Normalize: pastikan pakai kode negara
    let normalized = digits;
    if (normalized.startsWith("0")) {
      normalized = "62" + normalized.substring(1);
    }
    validJids.push(`${normalized}@s.whatsapp.net`);
  }

  if (validJids.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Nomor tidak valid.*\n\n` +
        `Pastikan format benar:\n` +
        `\`\`\`628xxxxxxxxxx\`\`\`\n\n` +
        `Atau ketik *batal* untuk membatalkan.`,
    });
    return true;
  }

  addMemberState.delete(senderNumber);

  await sock.sendMessage(jid, {
    text: `⏳ *Menambahkan ${validJids.length} nomor ke "${state.groupName}"...*`,
  });

  await executeGroupAddMembers(
    sock,
    jid,
    senderNumber,
    state.groupJid,
    state.groupName,
    validJids,
    invalidNumbers,
  );

  return true;
}

// ==========================================
// EXECUTE: ADD MEMBERS
// ==========================================
async function executeGroupAddMembers(
  sock,
  jid,
  senderNumber,
  groupJid,
  groupName,
  targetJids,
  invalidNumbers = [],
) {
  const results = [];
  const successJids = [];

  for (const targetJid of targetJids) {
    const number = jidToDigits(targetJid);
    try {
      const response = await sock.groupParticipantsUpdate(
        groupJid,
        [targetJid],
        "add",
      );

      // Response dari Baileys berupa array status
      const status = response?.[0]?.status;

      if (status === 200 || status === "200") {
        results.push(`✅ +${number} → Berhasil ditambahkan`);
        successJids.push(targetJid);
      } else if (status === 403 || status === "403") {
        results.push(`⛔ +${number} → Privasi diblokir (tidak bisa ditambah)`);
      } else if (status === 408 || status === "408") {
        results.push(`⏰ +${number} → Timeout, coba lagi`);
      } else if (status === 409 || status === "409") {
        results.push(`⚠️ +${number} → Sudah anggota group`);
      } else if (status === 404 || status === "404") {
        results.push(`❌ +${number} → Nomor tidak terdaftar di WhatsApp`);
      } else {
        results.push(`❓ +${number} → Status: ${status || "unknown"}`);
      }
    } catch (err) {
      let errMsg = "Gagal";
      if (err.message?.includes("not-authorized")) errMsg = "Bot bukan admin";
      if (err.message?.includes("not-participant")) errMsg = "Bukan anggota";
      if (err.message?.includes("invite")) errMsg = "User butuh link invite";
      results.push(`❌ +${number} → ${errMsg}`);
      console.error(`❌ Add member ${number}: ${err.message}`);
    }

    // Delay kecil agar tidak rate-limit
    await new Promise((r) => setTimeout(r, 500));
  }

  // Tambahkan invalid numbers ke laporan
  for (const inv of invalidNumbers) {
    results.push(`⚠️ "${inv}" → Format nomor tidak valid`);
  }

  const successCount = successJids.length;
  const failCount = results.length - successCount;

  let text =
    `╔══════════════════════════╗\n` +
    `║  ➕ *HASIL TAMBAH ANGGOTA*║\n` +
    `╚══════════════════════════╝\n\n` +
    `👥 *Group:* ${groupName}\n` +
    `✅ *Berhasil:* ${successCount}\n` +
    `❌ *Gagal:* ${failCount}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    results.map((r, i) => `${i + 1}. ${r}`).join("\n");

  await sock.sendMessage(jid, { text });
}

// ==========================================
// KICK MEMBER: PILIH GROUP
// ==========================================
async function handleGroupSelectForKick(sock, jid, senderNumber) {
  const valid = await canAccessGroupManager(sock, senderNumber);
  if (!valid) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  const joinedGroups = await getJoinedGroupsForSender(sock, senderNumber);
  const adminGroups = joinedGroups.filter((g) => g.botIsAdmin);

  if (adminGroups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `❌ *Tidak ada group yang bisa dikelola.*\n\n` +
        `Bot harus menjadi admin group\n` +
        `untuk bisa kick anggota.`,
    });
    return;
  }

  const rows = adminGroups.slice(0, 10).map((g) => {
    const memberCount = g.participants.length;
    const shortName =
      g.name.length > 20 ? g.name.substring(0, 20) + "…" : g.name;
    return {
      header: `✅ ${memberCount} anggota`,
      title: shortName,
      description: `Kick anggota dari group ini`,
      id: `grpkicklist_${g.jid}`,
    };
  });

  await sock.sendMessage(jid, {
    text:
      `🚫 *KICK/BAN ANGGOTA GROUP*\n\n` +
      `Pilih group:\n` +
      `Total: *${adminGroups.length}* group\n\n` +
      `⚠️ _Hanya group dimana bot adalah admin_`,
    footer: "Pilih group",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "👥 Pilih Group",
          sections: [{ title: "✅ Group (Bot Admin)", rows }],
        }),
      },
    ],
  });
}

// ==========================================
// KICK MEMBER: TAMPILKAN DAFTAR ANGGOTA
// ==========================================
async function handleGroupKickList(sock, jid, senderNumber, groupJid) {
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);
  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar anggota...*` });

  const meta = await sock.groupMetadata(groupJid).catch(() => null);
  if (!meta) {
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil data group.` });
    return;
  }

  const groupName = meta.subject || "Group";

  // Filter: tampilkan semua KECUALI bot dan superadmin
  const kickableMembers = meta.participants.filter((p) => {
    if (isParticipantBot(p.id)) return false;
    if (p.admin === "superadmin") return false;
    return true;
  });

  if (kickableMembers.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *Tidak ada anggota yang bisa di-kick.*\n\n` +
        `👥 Group: *${groupName}*`,
    });
    return;
  }

  // Bagi per section (max 10 per section)
  const sections = [];
  for (let i = 0; i < kickableMembers.length; i += 10) {
    const chunk = kickableMembers.slice(i, i + 10);
    const sectionTitle =
      i === 0 ? `👤 Anggota (${kickableMembers.length})` : `👤 Lanjutan`;

    sections.push({
      title: sectionTitle,
      rows: chunk.map((p) => {
        const isAdmin = p.admin === "admin";
        const name = getDisplayName(p);
        const number = jidToDigits(p.id);
        return {
          header: isAdmin ? `🛡️ Admin` : `👤 Member`,
          title: name,
          description: `+${number} — Tap untuk kick`,
          id: `grpkick_${groupJid}__${p.id}`,
        };
      }),
    });
  }

  await sock.sendMessage(jid, {
    text:
      `🚫 *KICK/BAN ANGGOTA*\n\n` +
      `👥 *Group:* ${groupName}\n` +
      `👤 *Bisa di-kick:* ${kickableMembers.length} orang\n\n` +
      `⚠️ _Owner group tidak bisa di-kick_\n\n` +
      `Pilih anggota yang ingin dikeluarkan 👇\n\n` +
      `Atau gunakan command:\n` +
      `\`\`\`/kick @mention\`\`\``,
    footer: "⚠️ Tindakan ini tidak bisa dibatalkan",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "🚫 Pilih Anggota",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// EXECUTE: KICK MEMBER
// ==========================================
async function executeGroupKick(sock, jid, senderNumber, groupJid, targetJid) {
  const valid = await validateGroupAccess(sock, jid, senderNumber, groupJid);
  if (!valid) return;

  const targetNumber = jidToDigits(targetJid);

  try {
    const metaBefore = await sock.groupMetadata(groupJid).catch(() => null);
    const pBefore = metaBefore?.participants?.find((p) => p.id === targetJid);
    const groupName = metaBefore?.subject || "Group";

    // Cek: tidak bisa kick owner group
    if (pBefore?.admin === "superadmin") {
      await sock.sendMessage(jid, {
        text:
          `⛔ *TIDAK BISA KICK OWNER GROUP*\n\n` +
          `👤 ${getDisplayName(pBefore)} adalah Owner group.\n` +
          `Owner group tidak bisa dikeluarkan.`,
      });
      return;
    }

    // Cek: tidak bisa kick bot sendiri
    if (isParticipantBot(targetJid)) {
      await sock.sendMessage(jid, {
        text: `⛔ Tidak bisa kick bot sendiri dari group.`,
      });
      return;
    }

    const displayName = pBefore ? getDisplayName(pBefore) : `+${targetNumber}`;
    const wasAdmin = pBefore?.admin === "admin";

    await sock.sendMessage(jid, {
      text: `⏳ *Mengeluarkan ${displayName}...*`,
    });

    await sock.groupParticipantsUpdate(groupJid, [targetJid], "remove");

    console.log(
      `🚫 Kick OK: ${displayName} (${wasAdmin ? "admin" : "member"}) ` +
        `dari ${groupName} oleh +${senderNumber}`,
    );

    await sock.sendMessage(jid, {
      text:
        `✅ *KICK BERHASIL!*\n\n` +
        `👥 *Group:* ${groupName}\n` +
        `👤 *User:* @${targetNumber}\n` +
        `📛 *Nama:* ${displayName}\n` +
        `🏷️ *Role:* ${wasAdmin ? "🛡️ Admin" : "👤 Member"}\n` +
        `🚫 Dikeluarkan dari group\n` +
        `⏰ ${new Date().toLocaleString("id-ID")}`,
      mentions: [targetJid],
    });
  } catch (err) {
    console.error(`❌ Kick failed: ${err.message}`);
    let errMsg = err.message;
    if (errMsg.includes("not-authorized")) errMsg = "Bot bukan admin group.";
    if (errMsg.includes("not-participant")) errMsg = "User bukan anggota.";

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL KICK*\n\n` + `👤 @${targetNumber}\n` + `Error: ${errMsg}`,
      mentions: [targetJid],
    });
  }
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
          `${getDisplayName(pBefore)} adalah Owner group.`,
      });
      return;
    }

    const displayName = pBefore ? getDisplayName(pBefore) : `+${targetNumber}`;

    await sock.groupParticipantsUpdate(groupJid, [targetJid], "demote");

    const meta = await sock.groupMetadata(groupJid).catch(() => null);
    const groupName = meta?.subject || "Group";

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
      text: `⚠️ *Bot bukan admin group ini.*`,
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

  for (const targetJid of mentions) {
    const number = jidToDigits(targetJid);
    const participant = meta?.participants?.find((p) => p.id === targetJid);
    const displayName = participant
      ? getDisplayName(participant)
      : `+${number}`;

    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "promote");
      results.push(`✅ @${number} (${displayName}) → 🛡️ Admin`);
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
      text: `⚠️ *Bot bukan admin group ini.*`,
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
// COMMAND /kick @user (di dalam group)
// ==========================================
async function handleKickCommand(sock, msg, jid, senderNumber) {
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
      text: `⛔ *AKSES DITOLAK*\n\nHanya admin group yang bisa kick.`,
    });
    return;
  }

  const botIsAdmin = await isBotAdminInGroup(sock, jid);
  if (!botIsAdmin) {
    await sock.sendMessage(jid, {
      text: `⚠️ *Bot bukan admin group ini.*`,
    });
    return;
  }

  const mentions =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentions.length === 0) {
    await sock.sendMessage(jid, { text: `❌ Format: \`/kick @user\`` });
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
        `⛔ @${number} (${displayName}) → Owner group, tidak bisa di-kick`,
      );
      continue;
    }

    if (isParticipantBot(targetJid)) {
      results.push(`⛔ @${number} → Tidak bisa kick bot sendiri`);
      continue;
    }

    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "remove");
      results.push(`✅ @${number} (${displayName}) → 🚫 Dikeluarkan`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    { text: `🚫 *HASIL KICK*\n\n${results.join("\n")}`, mentions },
    { quoted: msg },
  );
}

// ==========================================
// COMMAND /add 628xxx (di dalam group atau DM)
// ==========================================
async function handleAddCommand(sock, msg, jid, senderNumber, rawText) {
  // Bisa dari DM atau dari group
  const isAllowed =
    isOwner(senderNumber) ||
    isAdminBot(senderNumber) ||
    (jid.endsWith("@g.us") &&
      (await isSenderAdminInGroup(sock, jid, senderNumber)));

  if (!isAllowed) {
    await sock.sendMessage(jid, {
      text: `⛔ *AKSES DITOLAK*`,
    });
    return;
  }

  // Jika di group: langsung add ke group ini
  if (jid.endsWith("@g.us")) {
    const botIsAdmin = await isBotAdminInGroup(sock, jid);
    if (!botIsAdmin) {
      await sock.sendMessage(jid, {
        text: `⚠️ *Bot bukan admin group ini.*`,
      });
      return;
    }

    const parts = rawText.trim().split(/\s+/);
    const numberArgs = parts.slice(1); // hapus "/add"

    if (numberArgs.length === 0) {
      await sock.sendMessage(jid, {
        text: `❌ Format: \`/add 628xxxxxxxxxx\`\n\nBanyak nomor:\n\`/add 628xxx 628yyy\``,
      });
      return;
    }

    const targetJids = [];
    const invalidNums = [];

    for (const raw of numberArgs) {
      const digits = raw.replace(/[^0-9]/g, "");
      if (digits.length < 8) {
        invalidNums.push(raw);
        continue;
      }
      let normalized = digits;
      if (normalized.startsWith("0"))
        normalized = "62" + normalized.substring(1);
      targetJids.push(`${normalized}@s.whatsapp.net`);
    }

    const meta = await sock.groupMetadata(jid).catch(() => null);
    const groupName = meta?.subject || "Group";

    await executeGroupAddMembers(
      sock,
      jid,
      senderNumber,
      jid,
      groupName,
      targetJids,
      invalidNums,
    );
    return;
  }

  // Jika dari DM: perlu pilih group dulu
  await handleGroupSelectForAddMember(sock, jid, senderNumber);
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  const hasAccess = await canAccessGroupManager(sock, senderNumber);
  if (!hasAccess) return;

  // Bot bukan admin
  if (rawId.startsWith("grpnotadmin_")) {
    const groupJid = rawId.replace("grpnotadmin_", "");
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Pilih group untuk aksi
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
    else if (action === "add")
      await handleGroupAddMemberInput(sock, jid, senderNumber, groupJid);
    else if (action === "kick")
      await handleGroupKickList(sock, jid, senderNumber, groupJid);
    return;
  }

  // Promote execute
  if (rawId.startsWith("grppromote_")) {
    const without = rawId.replace("grppromote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupPromote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  // Demote execute
  if (rawId.startsWith("grpdemote_")) {
    const without = rawId.replace("grpdemote_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupDemote(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  // Add member: pilih group
  if (rawId === "grpadmin_add_member") {
    await handleGroupSelectForAddMember(sock, jid, senderNumber);
    return;
  }

  // Add member: group dipilih → tampilkan input nomor
  if (rawId.startsWith("grpaddmember_")) {
    const groupJid = rawId.replace("grpaddmember_", "");
    await handleGroupAddMemberInput(sock, jid, senderNumber, groupJid);
    return;
  }

  // Kick: pilih group
  if (rawId === "grpadmin_kick_member") {
    await handleGroupSelectForKick(sock, jid, senderNumber);
    return;
  }

  // Kick: list anggota
  if (rawId.startsWith("grpkicklist_")) {
    const groupJid = rawId.replace("grpkicklist_", "");
    await handleGroupKickList(sock, jid, senderNumber, groupJid);
    return;
  }

  // Kick execute
  if (rawId.startsWith("grpkick_")) {
    const without = rawId.replace("grpkick_", "");
    const sep = without.indexOf("__");
    if (sep === -1) return;
    const groupJid = without.substring(0, sep);
    const targetJid = without.substring(sep + 2);
    await executeGroupKick(sock, jid, senderNumber, groupJid, targetJid);
    return;
  }

  // Banner
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
  handleKickCommand,
  handleAddCommand,

  // Add member state handler
  handleAddMemberTextInput,
  addMemberState,

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
