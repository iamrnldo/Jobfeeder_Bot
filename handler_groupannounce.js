// ==========================================
//  HANDLER_GROUPANNOUNCE.JS
//  Broadcast/Announce ke beberapa group
//  Support: text, foto, audio, video, file
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { isOwner, isAdminBot, jidToDigits } = require("./handler_owner");
const { findBotInParticipants } = require("./handler_admin_group");

// ==========================================
// STATE MAP
// ==========================================
const announceState = new Map();

// ==========================================
// HELPERS
// ==========================================
function isAllowedSender(senderNumber) {
  return isOwner(senderNumber) || isAdminBot(senderNumber);
}

function clearState(senderNumber) {
  announceState.delete(senderNumber);
}

function getState(senderNumber) {
  return announceState.get(senderNumber);
}

function setState(senderNumber, data) {
  announceState.set(senderNumber, {
    ...data,
    timestamp: Date.now(),
  });
}

function isStateExpired(state) {
  if (!state) return true;
  return Date.now() - state.timestamp > 15 * 60 * 1000;
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==========================================
// DOWNLOAD MEDIA + TIMEOUT
// ==========================================
async function downloadMedia(sock, msg, timeoutMs = 60000) {
  const { downloadMediaMessage } = require("atexovi-baileys");

  const logger = {
    info: () => {},
    error: console.error,
    warn: () => {},
    debug: () => {},
    trace: () => {},
    child: function () {
      return this;
    },
  };

  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `Download timeout setelah ${timeoutMs / 1000} detik.\n` +
            `Coba kirim ulang atau gunakan file yang lebih kecil.`,
        ),
      );
    }, timeoutMs);
  });

  try {
    const buffer = await Promise.race([
      downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger, reuploadRequest: sock.updateMediaMessage },
      ),
      timeoutPromise,
    ]);
    clearTimeout(timeoutHandle);
    return buffer;
  } catch (err) {
    clearTimeout(timeoutHandle);
    throw err;
  }
}

// ==========================================
// MENU SECTION
// ==========================================
function getAnnounceMenuSection() {
  return {
    title: "📢 Broadcast Group",
    highlight_label: "Admin Only",
    rows: [
      {
        header: "📢",
        title: "Buat Announcement",
        description: "Kirim pesan ke beberapa group sekaligus",
        id: "announce_start",
      },
      {
        header: "📋",
        title: "Riwayat Broadcast",
        description: "Lihat history broadcast terakhir",
        id: "announce_history",
      },
    ],
  };
}

// ==========================================
// HISTORY
// ==========================================
const HISTORY_PATH = path.join(__dirname, "database", "announce_history.json");

function loadHistory() {
  try {
    const dir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(HISTORY_PATH)) {
      fs.writeFileSync(HISTORY_PATH, "[]");
      return [];
    }
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 50), null, 2));
}

// ==========================================
// STEP 1: START
// ==========================================
async function handleAnnounceStart(sock, jid, senderNumber) {
  if (!isAllowedSender(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  clearState(senderNumber);
  await sock.sendMessage(jid, { text: `⏳ *Mengambil daftar group...*` });

  let availableGroups = [];
  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    for (const g of groupList) {
      let participants = g.participants || [];
      let groupName = g.subject || "Unknown";
      let botIsAdmin = false;
      let memberCount = participants.length;

      try {
        const fresh = await sock.groupMetadata(g.id);
        participants = fresh.participants || participants;
        groupName = fresh.subject || groupName;
        memberCount = participants.length;
      } catch (e) {}

      const botP = findBotInParticipants(participants);
      if (botP) {
        botIsAdmin = botP.admin === "admin" || botP.admin === "superadmin";
      }

      availableGroups.push({
        jid: g.id,
        name: groupName,
        memberCount,
        botIsAdmin,
      });
    }
  } catch (e) {
    await sock.sendMessage(jid, {
      text: `❌ Gagal mengambil daftar group: ${e.message}`,
    });
    return;
  }

  if (availableGroups.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ *Bot tidak ada di group manapun.*`,
    });
    return;
  }

  setState(senderNumber, {
    step: "select_groups",
    jid,
    selectedGroups: [],
    availableGroups,
    content: null,
  });

  await sendGroupSelectionMenu(sock, jid, senderNumber);
}

// ==========================================
// MENU PILIH GROUP
// ==========================================
async function sendGroupSelectionMenu(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state) return;

  const { availableGroups, selectedGroups } = state;
  const adminGroups = availableGroups.filter((g) => g.botIsAdmin);
  const nonAdminGroups = availableGroups.filter((g) => !g.botIsAdmin);
  const selectedCount = selectedGroups.length;
  const totalGroups = availableGroups.length;

  const adminRows = adminGroups.slice(0, 8).map((g) => {
    const isSelected = selectedGroups.includes(g.jid);
    const shortName =
      g.name.length > 18 ? g.name.substring(0, 18) + "…" : g.name;
    return {
      header: isSelected ? `✅ DIPILIH` : `○ Belum dipilih`,
      title: shortName,
      description: `${g.memberCount} anggota`,
      id: `announce_toggle_${g.jid}`,
    };
  });

  const nonAdminRows = nonAdminGroups.slice(0, 5).map((g) => {
    const isSelected = selectedGroups.includes(g.jid);
    const shortName =
      g.name.length > 18 ? g.name.substring(0, 18) + "…" : g.name;
    return {
      header: isSelected ? `✅ DIPILIH` : `⚠️ Bot bukan admin`,
      title: shortName,
      description: `${g.memberCount} anggota`,
      id: `announce_toggle_${g.jid}`,
    };
  });

  const sections = [];

  sections.push({
    title: "⚡ Aksi Cepat",
    rows: [
      {
        header: "✅",
        title: "Pilih Semua Group",
        description: `Pilih semua ${totalGroups} group`,
        id: "announce_select_all",
      },
      {
        header: "❌",
        title: "Batal Semua Pilihan",
        description: "Kosongkan semua pilihan",
        id: "announce_deselect_all",
      },
      {
        header: "▶️",
        title: `Lanjut — ${selectedCount} group dipilih`,
        description:
          selectedCount > 0
            ? `Buat konten untuk ${selectedCount} group`
            : "Pilih minimal 1 group dulu",
        id:
          selectedCount > 0 ? "announce_next_compose" : "announce_need_select",
      },
    ],
  });

  if (adminRows.length > 0) {
    sections.push({
      title: `✅ Bot Admin (${adminGroups.length} group)`,
      rows: adminRows,
    });
  }

  if (nonAdminRows.length > 0) {
    sections.push({
      title: `⚠️ Bot Bukan Admin (${nonAdminGroups.length} group)`,
      rows: nonAdminRows,
    });
  }

  let selectedListText = "";
  if (selectedCount > 0) {
    const names = selectedGroups
      .slice(0, 10)
      .map((gjid) => {
        const g = availableGroups.find((x) => x.jid === gjid);
        return `✅ ${g?.name || gjid}`;
      })
      .join("\n");
    selectedListText =
      `\n\n*Group dipilih:*\n${names}` +
      (selectedCount > 10 ? `\n_...dan ${selectedCount - 10} lainnya_` : "");
  }

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  📢 *BROADCAST GROUP*    ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📊 *Total group:* ${totalGroups}\n` +
      `✅ *Dipilih:* ${selectedCount}\n\n` +
      `Tap nama group untuk pilih/batal pilih.` +
      selectedListText,
    footer:
      selectedCount > 0
        ? `✅ ${selectedCount} group dipilih — tap Lanjut`
        : `Pilih minimal 1 group`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Group Tujuan",
          sections,
        }),
      },
    ],
  });
}

// ==========================================
// TOGGLE GROUP
// ==========================================
async function handleAnnounceToggleGroup(sock, jid, senderNumber, groupJid) {
  const state = getState(senderNumber);
  if (!state || isStateExpired(state)) {
    clearState(senderNumber);
    await sock.sendMessage(jid, {
      text: `⏰ *Session habis.* Ketik *announce* untuk mulai lagi.`,
    });
    return;
  }

  const { selectedGroups } = state;
  const idx = selectedGroups.indexOf(groupJid);

  if (idx === -1) {
    selectedGroups.push(groupJid);
  } else {
    selectedGroups.splice(idx, 1);
  }

  const groupInfo = state.availableGroups.find((g) => g.jid === groupJid);
  const groupName = groupInfo?.name || groupJid;
  const action = idx === -1 ? "✅ Ditambahkan" : "❌ Dihapus";

  setState(senderNumber, { ...state, selectedGroups });

  await sock.sendMessage(jid, {
    text:
      `${action}: *${groupName}*\n` +
      `📊 Total dipilih: *${selectedGroups.length} group*`,
  });

  await sendGroupSelectionMenu(sock, jid, senderNumber);
}

// ==========================================
// SELECT ALL / DESELECT ALL
// ==========================================
async function handleAnnounceSelectAll(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state || isStateExpired(state)) {
    clearState(senderNumber);
    return;
  }
  const allJids = state.availableGroups.map((g) => g.jid);
  setState(senderNumber, { ...state, selectedGroups: allJids });
  await sock.sendMessage(jid, {
    text: `✅ *Semua ${allJids.length} group dipilih.*`,
  });
  await sendGroupSelectionMenu(sock, jid, senderNumber);
}

async function handleAnnounceDeselectAll(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state || isStateExpired(state)) {
    clearState(senderNumber);
    return;
  }
  setState(senderNumber, { ...state, selectedGroups: [] });
  await sock.sendMessage(jid, {
    text: `❌ *Semua pilihan dikosongkan.*`,
  });
  await sendGroupSelectionMenu(sock, jid, senderNumber);
}

// ==========================================
// STEP 2: COMPOSE
// ==========================================
async function handleAnnounceCompose(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state || isStateExpired(state)) {
    clearState(senderNumber);
    await sock.sendMessage(jid, {
      text: `⏰ *Session habis.* Ketik *announce* untuk mulai lagi.`,
    });
    return;
  }

  if (state.selectedGroups.length === 0) {
    await sock.sendMessage(jid, {
      text: `❌ *Pilih minimal 1 group terlebih dahulu.*`,
    });
    await sendGroupSelectionMenu(sock, jid, senderNumber);
    return;
  }

  setState(senderNumber, { ...state, step: "compose", content: null });

  const selectedNames = state.selectedGroups
    .map((gjid) => {
      const g = state.availableGroups.find((x) => x.jid === gjid);
      return `├ ${g?.name || gjid}`;
    })
    .join("\n");

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ✍️  *BUAT KONTEN*       ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📤 *Akan dikirim ke:*\n` +
      `${selectedNames}\n` +
      `└ Total: *${state.selectedGroups.length} group*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📝 *Kirim konten announce:*\n\n` +
      `*📝 Teks* → langsung ketik pesan\n\n` +
      `*🖼️ Foto* → kirim foto\n` +
      `└ Caption tulis di kolom caption foto\n` +
      `└ _(bukan pesan teks terpisah)_\n\n` +
      `*🎥 Video* → kirim video\n` +
      `└ Caption tulis di kolom caption\n\n` +
      `*🎵 Audio* → kirim audio/voice note\n\n` +
      `*📎 File* → kirim dokumen/file\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ _Session aktif 15 menit_\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });
}

// ==========================================
// STEP 3: PREVIEW
// ==========================================
async function handleAnnouncePreview(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state || !state.content) return;

  setState(senderNumber, { ...state, step: "preview" });

  const { content, selectedGroups, availableGroups } = state;

  const groupList = selectedGroups
    .map((gjid) => {
      const g = availableGroups.find((x) => x.jid === gjid);
      return `├ ${g?.name || gjid} (${g?.memberCount || "?"} anggota)`;
    })
    .join("\n");

  const typeEmoji =
    {
      text: "📝",
      image: "🖼️",
      video: "🎥",
      audio: "🎵",
      document: "📎",
    }[content.type] || "📄";

  let contentDesc = "";
  switch (content.type) {
    case "text":
      contentDesc =
        `${typeEmoji} *Teks:*\n` +
        `"${content.text?.substring(0, 150)}` +
        `${(content.text?.length || 0) > 150 ? "..." : ""}"`;
      break;
    case "image":
      contentDesc =
        `${typeEmoji} *Foto*\n` +
        `Ukuran: ${formatSize(content.mediaBuffer?.length)}\n` +
        (content.caption
          ? `Caption: "${content.caption?.substring(0, 80)}"`
          : `_(tanpa caption)_`);
      break;
    case "video":
      contentDesc =
        `${typeEmoji} *Video*\n` +
        `Ukuran: ${formatSize(content.mediaBuffer?.length)}\n` +
        (content.caption
          ? `Caption: "${content.caption?.substring(0, 80)}"`
          : `_(tanpa caption)_`);
      break;
    case "audio":
      contentDesc =
        `${typeEmoji} *${content.ptt ? "Voice Note" : "Audio"}*\n` +
        `Ukuran: ${formatSize(content.mediaBuffer?.length)}`;
      break;
    case "document":
      contentDesc =
        `${typeEmoji} *File: ${content.fileName || "unknown"}*\n` +
        `Ukuran: ${formatSize(content.mediaBuffer?.length)}\n` +
        (content.caption
          ? `Caption: "${content.caption?.substring(0, 80)}"`
          : `_(tanpa caption)_`);
      break;
    default:
      contentDesc = `${typeEmoji} ${content.type}`;
  }

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  👁️  *PREVIEW ANNOUNCE*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📤 *Tujuan (${selectedGroups.length} group):*\n` +
      `${groupList}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📋 *Konten:*\n` +
      `${contentDesc}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚠️ Pesan akan dikirim ke *${selectedGroups.length} group*.`,
    footer: "Konfirmasi pengiriman",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📢 Konfirmasi",
          sections: [
            {
              title: "⚙️ Aksi",
              rows: [
                {
                  header: "✅",
                  title: "Kirim Sekarang",
                  description: `Broadcast ke ${selectedGroups.length} group`,
                  id: "announce_send",
                },
                {
                  header: "✍️",
                  title: "Ganti Konten",
                  description: "Ubah pesan/media",
                  id: "announce_recompose",
                },
                {
                  header: "👥",
                  title: "Ganti Group Tujuan",
                  description: "Ubah pilihan group",
                  id: "announce_reselect",
                },
                {
                  header: "❌",
                  title: "Batalkan",
                  description: "Batalkan broadcast",
                  id: "announce_cancel",
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
// STEP 4: SEND
// ==========================================
async function handleAnnounceSend(sock, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state || !state.content) {
    await sock.sendMessage(jid, {
      text: `❌ *Tidak ada konten.* Ketik *announce* untuk mulai lagi.`,
    });
    return;
  }

  if (isStateExpired(state)) {
    clearState(senderNumber);
    await sock.sendMessage(jid, {
      text: `⏰ *Session habis.* Ketik *announce* untuk mulai lagi.`,
    });
    return;
  }

  setState(senderNumber, { ...state, step: "sending" });

  const { content, selectedGroups, availableGroups } = state;
  const total = selectedGroups.length;

  await sock.sendMessage(jid, {
    text:
      `📢 *MEMULAI BROADCAST...*\n\n` +
      `📤 Mengirim ke *${total} group*\n` +
      `⏳ Mohon tunggu...`,
  });

  const results = { success: [], failed: [] };
  const startTime = Date.now();

  for (let i = 0; i < selectedGroups.length; i++) {
    const groupJid = selectedGroups[i];
    const groupInfo = availableGroups.find((g) => g.jid === groupJid);
    const groupName = groupInfo?.name || groupJid;

    try {
      await sendContentToGroup(sock, groupJid, content);
      results.success.push(groupName);
      console.log(`📢 [Announce] ✅ ${i + 1}/${total} → "${groupName}"`);
    } catch (err) {
      results.failed.push({ name: groupName, error: err.message });
      console.error(
        `📢 [Announce] ❌ ${i + 1}/${total} → "${groupName}": ${err.message}`,
      );
    }

    // Progress setiap 5 group
    if ((i + 1) % 5 === 0 && i + 1 < total) {
      await sock.sendMessage(jid, {
        text:
          `⏳ *Progress:* ${i + 1}/${total}\n` +
          `✅ Berhasil: ${results.success.length}\n` +
          `❌ Gagal: ${results.failed.length}`,
      });
    }

    if (i < selectedGroups.length - 1) {
      await delay(1500);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  let reportText =
    `╔══════════════════════════╗\n` +
    `║  📢 *HASIL BROADCAST*    ║\n` +
    `╚══════════════════════════╝\n\n` +
    `📊 *Ringkasan:*\n` +
    `├ 📤 Total: ${total} group\n` +
    `├ ✅ Berhasil: ${results.success.length}\n` +
    `├ ❌ Gagal: ${results.failed.length}\n` +
    `└ ⏱️ Waktu: ${elapsed} detik\n\n`;

  if (results.success.length > 0) {
    reportText += `✅ *Berhasil:*\n`;
    results.success.forEach((name, i) => {
      const prefix = i === results.success.length - 1 ? "└" : "├";
      reportText += `${prefix} ${name}\n`;
    });
    reportText += "\n";
  }

  if (results.failed.length > 0) {
    reportText += `❌ *Gagal:*\n`;
    results.failed.forEach((f, i) => {
      const prefix = i === results.failed.length - 1 ? "└" : "├";
      reportText += `${prefix} ${f.name}: ${f.error?.substring(0, 50)}\n`;
    });
  }

  await sock.sendMessage(jid, { text: reportText });

  saveHistory({
    id: `ANN-${Date.now()}`,
    sender: senderNumber,
    contentType: content.type,
    contentPreview:
      content.type === "text"
        ? content.text?.substring(0, 100)
        : content.caption || `[${content.type}]`,
    totalGroups: total,
    successCount: results.success.length,
    failCount: results.failed.length,
    successGroups: results.success,
    failedGroups: results.failed.map((f) => f.name),
    elapsed,
    createdAt: new Date().toISOString(),
  });

  clearState(senderNumber);
}

// ==========================================
// KIRIM KONTEN KE SATU GROUP
// ==========================================
async function sendContentToGroup(sock, groupJid, content) {
  switch (content.type) {
    case "text":
      await sock.sendMessage(groupJid, { text: content.text });
      break;

    case "image":
      await sock.sendMessage(groupJid, {
        image: content.mediaBuffer,
        caption: content.caption || "",
        mimetype: content.mimetype || "image/jpeg",
      });
      break;

    case "video":
      await sock.sendMessage(groupJid, {
        video: content.mediaBuffer,
        caption: content.caption || "",
        mimetype: content.mimetype || "video/mp4",
      });
      break;

    case "audio":
      await sock.sendMessage(groupJid, {
        audio: content.mediaBuffer,
        mimetype: content.mimetype || "audio/ogg; codecs=opus",
        ptt: content.ptt || false,
      });
      break;

    case "document":
      await sock.sendMessage(groupJid, {
        document: content.mediaBuffer,
        mimetype: content.mimetype || "application/octet-stream",
        fileName: content.fileName || "file",
        caption: content.caption || "",
      });
      break;

    default:
      throw new Error(`Tipe konten tidak dikenal: ${content.type}`);
  }
}

// ==========================================
// HISTORY
// ==========================================
async function handleAnnounceHistory(sock, jid, senderNumber) {
  if (!isAllowedSender(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const history = loadHistory();

  if (history.length === 0) {
    await sock.sendMessage(jid, {
      text: `📋 *RIWAYAT BROADCAST*\n\n_Belum ada riwayat._`,
    });
    return;
  }

  let text =
    `╔══════════════════════════╗\n` +
    `║  📋 *RIWAYAT BROADCAST*  ║\n` +
    `╚══════════════════════════╝\n\n`;

  history.slice(0, 10).forEach((h, i) => {
    const date = new Date(h.createdAt).toLocaleString("id-ID");
    const typeEmoji =
      {
        text: "📝",
        image: "🖼️",
        video: "🎥",
        audio: "🎵",
        document: "📎",
      }[h.contentType] || "📄";

    text +=
      `*${i + 1}. ${h.id}*\n` +
      `   ${typeEmoji} ${(h.contentType || "?").toUpperCase()}\n` +
      `   📤 ${h.totalGroups} group · ✅ ${h.successCount} · ❌ ${h.failCount}\n` +
      `   💬 "${h.contentPreview?.substring(0, 50)}"\n` +
      `   ⏱️ ${h.elapsed}s · 📅 ${date}\n\n`;
  });

  text += `_${Math.min(10, history.length)} dari ${history.length} broadcast_`;
  await sock.sendMessage(jid, { text });
}

// ==========================================
// HANDLE INCOMING MESSAGE
// Return true jika pesan sudah dihandle
// ==========================================
async function handleAnnounceIncoming(sock, msg, jid, senderNumber) {
  const state = getState(senderNumber);
  if (!state) return false;

  if (isStateExpired(state)) {
    clearState(senderNumber);
    await sock.sendMessage(jid, {
      text: `⏰ *Session broadcast habis.*\n\nKetik *announce* untuk mulai lagi.`,
    });
    return true;
  }

  if (state.step !== "compose") return false;

  const m = msg.message;
  if (!m) return false;

  // ── Unwrap pesan ──
  const actualMsg =
    m.ephemeralMessage?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2?.message ||
    m.documentWithCaptionMessage?.message ||
    m;

  // ── Cek batal ──
  const isPlainText = !!(
    actualMsg.conversation || actualMsg.extendedTextMessage?.text
  );
  const plainText = (
    actualMsg.conversation ||
    actualMsg.extendedTextMessage?.text ||
    ""
  )
    .toLowerCase()
    .trim();

  if (isPlainText && (plainText === "batal" || plainText === "cancel")) {
    clearState(senderNumber);
    await sock.sendMessage(jid, { text: `❌ *Broadcast dibatalkan.*` });
    return true;
  }

  // ==========================================
  // CEK MEDIA LEBIH DULU
  // ==========================================

  // ── IMAGE ──
  const imageMsg = actualMsg.imageMessage || m.imageMessage;
  if (imageMsg) {
    await sock.sendMessage(jid, {
      text: `⏳ *Mengunduh foto...*\n_Mohon tunggu_`,
    });
    try {
      const buffer = await downloadMedia(sock, msg, 30000);
      if (!buffer || buffer.length === 0)
        throw new Error("Download gagal, coba kirim ulang");

      console.log(`📢 [Announce] Image: ${formatSize(buffer.length)}`);

      setState(senderNumber, {
        ...state,
        content: {
          type: "image",
          mediaBuffer: buffer,
          caption: imageMsg.caption || "",
          mimetype: imageMsg.mimetype || "image/jpeg",
        },
      });

      await handleAnnouncePreview(sock, jid, senderNumber);
    } catch (err) {
      console.error(`📢 [Announce] Image error: ${err.message}`);
      await sock.sendMessage(jid, {
        text:
          `❌ *Gagal proses foto:*\n${err.message}\n\n` + `Coba kirim ulang.`,
      });
    }
    return true;
  }

  // ── VIDEO ──
  const videoMsg = actualMsg.videoMessage || m.videoMessage;
  if (videoMsg) {
    const videoSize = videoMsg.fileLength ? parseInt(videoMsg.fileLength) : 0;

    if (videoSize > 50 * 1024 * 1024) {
      await sock.sendMessage(jid, {
        text:
          `❌ *Video terlalu besar*\n\n` +
          `Ukuran: ${formatSize(videoSize)}\n` +
          `Maks untuk broadcast: *50 MB*\n\n` +
          `*Solusi:*\n` +
          `• Kompres video terlebih dahulu\n` +
          `• Atau kirim sebagai *File/Dokumen*\n` +
          `  (📎 → Document → pilih video)`,
      });
      return true;
    }

    await sock.sendMessage(jid, {
      text:
        `⏳ *Mengunduh video...*\n` +
        `Ukuran: ${formatSize(videoSize)}\n` +
        `_Proses ini mungkin membutuhkan waktu..._`,
    });

    try {
      const buffer = await downloadMedia(sock, msg, 120000);
      if (!buffer || buffer.length === 0)
        throw new Error("Download gagal, coba kirim ulang");

      console.log(`📢 [Announce] Video: ${formatSize(buffer.length)}`);

      setState(senderNumber, {
        ...state,
        content: {
          type: "video",
          mediaBuffer: buffer,
          caption: videoMsg.caption || "",
          mimetype: videoMsg.mimetype || "video/mp4",
        },
      });

      await handleAnnouncePreview(sock, jid, senderNumber);
    } catch (err) {
      console.error(`📢 [Announce] Video error: ${err.message}`);
      await sock.sendMessage(jid, {
        text:
          `❌ *Gagal proses video:*\n${err.message}\n\n` +
          `*Alternatif:* Kirim sebagai *File/Dokumen*\n` +
          `(📎 → Document → pilih video)`,
      });
    }
    return true;
  }

  // ── AUDIO / PTT ──
  const audioMsg = actualMsg.audioMessage || m.audioMessage;
  if (audioMsg) {
    await sock.sendMessage(jid, {
      text: `⏳ *Mengunduh audio...*\n_Mohon tunggu_`,
    });
    try {
      const buffer = await downloadMedia(sock, msg, 30000);
      if (!buffer || buffer.length === 0)
        throw new Error("Download gagal, coba kirim ulang");

      const isPtt = audioMsg.ptt || false;
      console.log(
        `📢 [Announce] ${isPtt ? "PTT" : "Audio"}: ${formatSize(buffer.length)}`,
      );

      setState(senderNumber, {
        ...state,
        content: {
          type: "audio",
          mediaBuffer: buffer,
          mimetype: audioMsg.mimetype || "audio/ogg; codecs=opus",
          ptt: isPtt,
        },
      });

      await handleAnnouncePreview(sock, jid, senderNumber);
    } catch (err) {
      console.error(`📢 [Announce] Audio error: ${err.message}`);
      await sock.sendMessage(jid, {
        text:
          `❌ *Gagal proses audio:*\n${err.message}\n\n` + `Coba kirim ulang.`,
      });
    }
    return true;
  }

  // ── DOCUMENT ──
  const docMsg =
    actualMsg.documentMessage ||
    m.documentMessage ||
    actualMsg.documentWithCaptionMessage?.message?.documentMessage;
  if (docMsg) {
    const fileSize = docMsg.fileLength ? parseInt(docMsg.fileLength) : 0;

    await sock.sendMessage(jid, {
      text:
        `⏳ *Mengunduh file...*\n` +
        `📎 ${docMsg.fileName || "file"}\n` +
        `Ukuran: ${formatSize(fileSize)}\n` +
        `_Mohon tunggu..._`,
    });

    try {
      const buffer = await downloadMedia(sock, msg, 60000);
      if (!buffer || buffer.length === 0)
        throw new Error("Download gagal, coba kirim ulang");

      console.log(
        `📢 [Announce] File: "${docMsg.fileName}" ${formatSize(buffer.length)}`,
      );

      setState(senderNumber, {
        ...state,
        content: {
          type: "document",
          mediaBuffer: buffer,
          mimetype: docMsg.mimetype || "application/octet-stream",
          fileName: docMsg.fileName || "file",
          caption: docMsg.caption || "",
        },
      });

      await handleAnnouncePreview(sock, jid, senderNumber);
    } catch (err) {
      console.error(`📢 [Announce] Doc error: ${err.message}`);
      await sock.sendMessage(jid, {
        text:
          `❌ *Gagal proses file:*\n${err.message}\n\n` + `Coba kirim ulang.`,
      });
    }
    return true;
  }

  // ── TEXT ──
  if (isPlainText) {
    const originalText =
      actualMsg.conversation || actualMsg.extendedTextMessage?.text || "";

    if (!originalText.trim()) return false;

    setState(senderNumber, {
      ...state,
      content: {
        type: "text",
        text: originalText,
      },
    });

    console.log(`📢 [Announce] Text: "${originalText.substring(0, 80)}"`);

    await handleAnnouncePreview(sock, jid, senderNumber);
    return true;
  }

  // ── Tipe tidak dikenal ──
  await sock.sendMessage(jid, {
    text:
      `⚠️ *Tipe pesan tidak didukung.*\n\n` +
      `Yang didukung:\n` +
      `• 📝 Teks\n` +
      `• 🖼️ Foto (caption di kolom caption)\n` +
      `• 🎥 Video max 50 MB\n` +
      `• 🎵 Audio / Voice Note\n` +
      `• 📎 File / Dokumen\n\n` +
      `❌ Ketik *batal* untuk membatalkan.`,
  });
  return true;
}

// ==========================================
// ROUTER
// ==========================================
async function handleAnnounceRouter(sock, msg, jid, senderNumber, rawId) {
  if (!isAllowedSender(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  if (rawId.startsWith("announce_toggle_")) {
    const groupJid = rawId.replace("announce_toggle_", "");
    await handleAnnounceToggleGroup(sock, jid, senderNumber, groupJid);
    return;
  }

  switch (rawId) {
    case "announce_start":
      await handleAnnounceStart(sock, jid, senderNumber);
      break;
    case "announce_select_all":
      await handleAnnounceSelectAll(sock, jid, senderNumber);
      break;
    case "announce_deselect_all":
      await handleAnnounceDeselectAll(sock, jid, senderNumber);
      break;
    case "announce_need_select":
      await sock.sendMessage(jid, {
        text: `⚠️ *Pilih minimal 1 group terlebih dahulu.*`,
      });
      await sendGroupSelectionMenu(sock, jid, senderNumber);
      break;
    case "announce_next_compose":
    case "announce_recompose":
      await handleAnnounceCompose(sock, jid, senderNumber);
      break;
    case "announce_reselect": {
      const state = getState(senderNumber);
      if (state) {
        setState(senderNumber, { ...state, step: "select_groups" });
        await sendGroupSelectionMenu(sock, jid, senderNumber);
      }
      break;
    }
    case "announce_send":
      await handleAnnounceSend(sock, jid, senderNumber);
      break;
    case "announce_cancel":
      clearState(senderNumber);
      await sock.sendMessage(jid, { text: `❌ *Broadcast dibatalkan.*` });
      break;
    case "announce_history":
      await handleAnnounceHistory(sock, jid, senderNumber);
      break;
    default:
      break;
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getAnnounceMenuSection,
  handleAnnounceStart,
  handleAnnounceRouter,
  handleAnnounceHistory,
  handleAnnounceIncoming,
  announceState,
};
