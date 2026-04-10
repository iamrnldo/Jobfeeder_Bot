// ==========================================
//  HANDLER_ADMIN_GROUP.JS
//  Khusus: Group Admin Manager
//  - Promote / Demote member group
//  - Lihat admin group
//  - Command /promote /demote di group
//
//  Hak Akses:
//  Owner + Admin Bot : semua fitur
//  Tidak bisa demote owner group (superadmin)
// ==========================================

const config = require("./config");
const {
  loadAdmins,
  isOwner,
  isAdmin,
  isAdminOrOwner,
  jidToDigits,
  normalizeNumber,
} = require("./handler_admin");

// ==========================================
// BOT LID REGISTRY
// ==========================================
const BOT_LID_LIST = ["127569823277085"];

let runtimeBotPhone = null;
let runtimeBotLid = null;

// ==========================================
// SET RUNTIME BOT INFO
// Dipanggil dari index.js saat connect
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

  console.log(`\n🔍 findBotInParticipants (${participants.length} total):`);

  for (const p of participants) {
    const pDigits = jidToDigits(p.id);
    const pDomain = (p.id.split("@")[1] || "").toLowerCase();
    const isBot = isParticipantBot(p.id);

    console.log(
      `   [${isBot ? "✅BOT" : "   "}] domain:${pDomain} digits:"${pDigits}" admin:${p.admin || "none"}`,
    );

    if (isBot) return p;
  }

  console.log(`   ❌ Bot not found`);
  return null;
}

// ==========================================
// CEK BOT ADMIN DI GROUP
// ==========================================
async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    console.log(`\n🔍 isBotAdmin - "${meta.subject}"`);

    let botP = findBotInParticipants(meta.participants);

    if (!botP) {
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const cached = allGroups[groupJid];
        if (cached?.participants) {
          botP = findBotInParticipants(cached.participants);
        }
      } catch (e) {
        console.error(`   Cache fallback error: ${e.message}`);
      }
    }

    if (!botP) return false;

    const isAdm = botP.admin === "admin" || botP.admin === "superadmin";
    console.log(`   ✅ Bot admin: ${isAdm} (${botP.admin || "none"})`);
    return isAdm;
  } catch (err) {
    console.error(`❌ isBotAdminInGroup error: ${err.message}`);
    return false;
  }
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
// HELPER: DISPLAY NAME
// Prioritas: nama → nomor (TIDAK pernah JID/LID)
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
// DEBUG LOG
// ==========================================
function logAccess(fn, senderNumber, granted) {
  console.log(
    `🔐 [${fn}] sender="${senderNumber}" ` +
      `isOwner=${isOwner(senderNumber)} ` +
      `isAdmin=${isAdmin(senderNumber)} ` +
      `→ ${granted ? "GRANTED" : "DENIED"}`,
  );
}

// ==========================================
// GROUP MANAGER — MENU UTAMA
// Owner + Admin bot bisa akses
// ==========================================
async function handleGroupManager(sock, jid, senderNumber) {
  logAccess("handleGroupManager", senderNumber, isAdminOrOwner(senderNumber));

  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text:
        `⛔ *AKSES DITOLAK*\n\n` +
        `Fitur ini hanya untuk Owner dan Admin bot.\n\n` +
        `Nomor kamu: +${senderNumber}`,
    });
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
      `📊 *Status Bot:*\n` +
      `├ 👥 Total group: ${joinedGroups.length}\n` +
      `├ ✅ Bot admin: ${adminCount} group\n` +
      `└ ⚠️ Bukan admin: ${nonAdminCount} group\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Pilih aksi:*\n` +
      `├ ⬆️ *Promote* → jadikan member jadi admin\n` +
      `├ ⬇️ *Demote* → turunkan admin jadi member\n` +
      `└ 👁️ *Lihat* → cek daftar admin group\n\n` +
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
  logAccess(
    "handleGroupSelectForAction",
    senderNumber,
    isAdminOrOwner(senderNumber),
  );

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
      text: `❌ *Tidak ada group.*\n\nKetik *group_manager* untuk kembali.`,
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
      `Total group: *${joinedGroups.length}*\n` +
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
  if (!isAdminOrOwner(senderNumber)) return;

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

  const groupName = meta.subject || "Group";
  const botIsAdmin = await isBotAdminInGroup(sock, groupJid);

  if (!botIsAdmin) {
    await handleBotNotAdmin(sock, jid, senderNumber, groupJid);
    return;
  }

  // Filter: hanya member biasa (bukan admin, bukan bot)
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
      `Atau command di group: \`/promote @user\`\n\n` +
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
  if (!isAdminOrOwner(senderNumber)) return;

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

  // Filter: hanya admin biasa (bukan superadmin/owner, bukan bot)
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
      `Atau command di group: \`/demote @user\`\n\n` +
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
  if (!isAdminOrOwner(senderNumber)) return;

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

  // Kumpulkan JID untuk mentions (internal Baileys)
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
  if (!isAdminOrOwner(senderNumber)) return;

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
    if (errMsg.includes("not-participant"))
      errMsg = "User bukan anggota group.";

    await sock.sendMessage(jid, {
      text: `❌ *GAGAL PROMOTE*\n\n👤 @${targetNumber}\nError: ${errMsg}`,
      mentions: [targetJid],
    });
  }
}

// ==========================================
// EXECUTE DEMOTE
// Tidak bisa demote superadmin/owner group
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
  await sock.sendMessage(jid, { text: `⏳ *Mendemote...*` });

  try {
    const metaBefore = await sock.groupMetadata(groupJid).catch(() => null);
    const pBefore = metaBefore?.participants?.find((p) => p.id === targetJid);

    // Proteksi: tidak bisa demote owner group
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
    if (errMsg.includes("not-participant")) errMsg = "Bukan anggota group.";

    await sock.sendMessage(jid, {
      text: `❌ *GAGAL DEMOTE*\n\n👤 @${targetNumber}\nError: ${errMsg}`,
      mentions: [targetJid],
    });
  }
}

// ==========================================
// COMMAND /promote @user (di group)
// ==========================================
async function handlePromoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
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
      console.log(`⬆️ Promote cmd: ${displayName} oleh ${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text: `⬆️ *HASIL PROMOTE*\n\n${results.join("\n")}`,
      mentions,
    },
    { quoted: msg },
  );
}

// ==========================================
// COMMAND /demote @user (di group)
// ==========================================
async function handleDemoteCommand(sock, msg, jid, senderNumber) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, {
      text: `❌ Hanya bisa digunakan di dalam *group*.`,
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

    // Proteksi: tidak bisa demote owner group
    if (participant?.admin === "superadmin") {
      results.push(
        `⛔ @${number} (${displayName}) → Owner, tidak bisa di-demote`,
      );
      continue;
    }

    try {
      await sock.groupParticipantsUpdate(jid, [targetJid], "demote");
      results.push(`✅ @${number} (${displayName}) → 👤 Member`);
      console.log(`⬇️ Demote cmd: ${displayName} oleh ${senderNumber}`);
    } catch (err) {
      let e = "Gagal";
      if (err.message?.includes("not-authorized")) e = "Bot bukan admin";
      if (err.message?.includes("not-participant")) e = "Bukan anggota";
      results.push(`❌ @${number} (${displayName}) → ${e}`);
    }
  }

  await sock.sendMessage(
    jid,
    {
      text: `⬇️ *HASIL DEMOTE*\n\n${results.join("\n")}`,
      mentions,
    },
    { quoted: msg },
  );
}

// ==========================================
// ROUTER GROUP ADMIN
// ==========================================
async function handleGroupAdminRouter(sock, msg, jid, senderNumber, rawId) {
  logAccess(
    "handleGroupAdminRouter",
    senderNumber,
    isAdminOrOwner(senderNumber),
  );

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
// EXPORT
// ==========================================
module.exports = {
  // Group manager
  handleGroupManager,
  handleGroupSelectForAction,
  handleGroupAdminRouter,
  handlePromoteCommand,
  handleDemoteCommand,

  // Bot identity
  setBotRuntimeInfo,
  isParticipantBot,
  findBotInParticipants,
  BOT_LID_LIST,
};
