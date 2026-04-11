// ==========================================
// HANDLER_GROUPANNOUNCE.JS - Broadcast/Announce
// ==========================================

const fs = require("fs");
const path = require("path");
const { isOwner, isAdminBot } = require("./handler_owner");

const ANNOUNCE_DB_PATH = path.join(
  __dirname,
  "database",
  "announce_history.json",
);
const ANNOUNCE_DB_DIR = path.join(__dirname, "database");

// ==========================================
// STATE MANAGEMENT
// ==========================================
// Map: senderNumber → { step, selectedGroups, message, mediaMsg, type }
const announceState = new Map();

// ==========================================
// DATABASE HELPERS
// ==========================================
function ensureDb() {
  if (!fs.existsSync(ANNOUNCE_DB_DIR)) {
    fs.mkdirSync(ANNOUNCE_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(ANNOUNCE_DB_PATH)) {
    fs.writeFileSync(ANNOUNCE_DB_PATH, "[]");
  }
}

function loadHistory() {
  ensureDb();
  try {
    return JSON.parse(fs.readFileSync(ANNOUNCE_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  ensureDb();
  fs.writeFileSync(ANNOUNCE_DB_PATH, JSON.stringify(history, null, 2));
}

function addHistory(entry) {
  const history = loadHistory();
  history.unshift({
    ...entry,
    id: `ANN_${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  // Simpan max 50 history
  if (history.length > 50) history.splice(50);
  saveHistory(history);
}

// ==========================================
// HELPER: Get All Groups Bot Is In
// ==========================================
async function getAllGroups(sock) {
  try {
    const groups = [];

    // Cara 1: dari store.chats
    if (sock.store?.chats) {
      const chatIds = Object.keys(sock.store.chats);
      for (const id of chatIds) {
        if (id.endsWith("@g.us")) {
          try {
            const meta = await sock.groupMetadata(id);
            if (meta) {
              groups.push({
                id: meta.id,
                name: meta.subject || id,
                participants: meta.participants?.length || 0,
              });
            }
          } catch (e) {
            // Skip grup yang tidak bisa diakses
          }
        }
      }
    }

    // Cara 2: fallback dari groupFetchAllParticipating
    if (groups.length === 0) {
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        for (const [id, meta] of Object.entries(allGroups)) {
          groups.push({
            id,
            name: meta.subject || id,
            participants: meta.participants?.length || 0,
          });
        }
      } catch (e) {
        console.error("❌ groupFetchAllParticipating error:", e.message);
      }
    }

    return groups;
  } catch (e) {
    console.error("❌ getAllGroups error:", e.message);
    return [];
  }
}

// ==========================================
// STEP 1: START ANNOUNCE — Tampilkan daftar grup
// ==========================================
async function handleAnnounceStart(sock, jid, senderNumber) {
  // Double check: hanya private chat
  if (!jid.endsWith("@s.whatsapp.net")) {
    await sock.sendMessage(jid, {
      text:
        `📢 *BROADCAST*\n\n` +
        `⚠️ Fitur ini hanya bisa digunakan di *private chat*.\n\n` +
        `Silakan chat bot secara langsung untuk menggunakan fitur broadcast.`,
    });
    return;
  }

  if (!isOwner(senderNumber) && !isAdminBot(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  await sock.sendMessage(jid, { text: "⏳ _Mengambil daftar grup..._" });

  const groups = await getAllGroups(sock);

  if (groups.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `📢 *BROADCAST*\n\n` +
        `❌ Bot tidak berada di grup manapun.\n\n` +
        `Tambahkan bot ke grup terlebih dahulu.`,
    });
    return;
  }

  // Inisialisasi state
  announceState.set(senderNumber, {
    step: "select_groups",
    groups, // semua grup tersedia
    selectedGroups: new Set(), // grup yang dipilih
    message: null,
    mediaMsg: null,
    type: null,
  });

  await sendGroupSelectionMenu(sock, jid, senderNumber);
}

// ==========================================
// TAMPILKAN MENU PILIH GRUP
// ==========================================
async function sendGroupSelectionMenu(sock, jid, senderNumber) {
  const state = announceState.get(senderNumber);
  if (!state) return;

  const { groups, selectedGroups } = state;

  // Buat rows untuk list
  const rows = groups.map((g, i) => {
    const isSelected = selectedGroups.has(g.id);
    return {
      header: isSelected ? "✅" : "⬜",
      title: g.name.substring(0, 24),
      description: `${g.participants} anggota${isSelected ? " — Dipilih" : ""}`,
      id: `announce_toggle_${g.id}`,
    };
  });

  // Tambahkan opsi aksi
  const actionRows = [
    {
      header: "✅",
      title: "Pilih Semua Grup",
      description: `Pilih semua ${groups.length} grup sekaligus`,
      id: "announce_select_all",
    },
    {
      header: "⬜",
      title: "Batalkan Semua Pilihan",
      description: "Kosongkan semua pilihan",
      id: "announce_deselect_all",
    },
    {
      header: "➡️",
      title: "Lanjut → Tulis Pesan",
      description: `${selectedGroups.size} grup dipilih`,
      id: "announce_next_compose",
    },
    {
      header: "❌",
      title: "Batal",
      description: "Batalkan broadcast",
      id: "announce_cancel",
    },
  ];

  const selectedList =
    selectedGroups.size > 0
      ? `\n\n✅ *Dipilih:* ${selectedGroups.size}/${groups.length} grup`
      : `\n\n⬜ *Belum ada grup dipilih*`;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  📢 *BROADCAST GRUP*    ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Pilih grup tujuan broadcast.\n` +
      `Total tersedia: *${groups.length} grup*` +
      selectedList +
      `\n\n👇 Pilih dari menu:`,
    footer: "📢 Broadcast Panel",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Grup & Aksi",
          sections: [
            {
              title: `📋 Daftar Grup (${groups.length})`,
              rows: rows.slice(0, 10), // max 10 per section
            },
            ...(groups.length > 10
              ? [
                  {
                    title: `📋 Grup Lainnya`,
                    rows: rows.slice(10, 20),
                  },
                ]
              : []),
            {
              title: "⚙️ Aksi",
              rows: actionRows,
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// STEP 2: COMPOSE PESAN
// ==========================================
async function sendComposeMenu(sock, jid, senderNumber) {
  const state = announceState.get(senderNumber);
  if (!state) return;

  const { selectedGroups, groups } = state;

  // Tampilkan nama grup yang dipilih
  const selectedNames = groups
    .filter((g) => selectedGroups.has(g.id))
    .map((g) => `• ${g.name}`)
    .join("\n");

  // Update step ke compose
  state.step = "compose";
  announceState.set(senderNumber, state);

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ✍️  *TULIS PESAN*       ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📋 *Grup Tujuan (${selectedGroups.size}):*\n` +
      `${selectedNames}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📝 *Kirim pesan broadcast:*\n` +
      `• Teks biasa\n` +
      `• Gambar + caption\n` +
      `• Video + caption\n\n` +
      `❌ Ketik *batal* untuk membatalkan`,
  });
}

// ==========================================
// STEP 3: KONFIRMASI KIRIM
// ==========================================
async function sendConfirmMenu(sock, jid, senderNumber) {
  const state = announceState.get(senderNumber);
  if (!state) return;

  const { selectedGroups, groups, message, type } = state;
  const selectedNames = groups
    .filter((g) => selectedGroups.has(g.id))
    .map((g) => `• ${g.name}`)
    .join("\n");

  const preview =
    type === "text"
      ? `📝 *Preview Pesan:*\n${message?.substring(0, 200)}${message?.length > 200 ? "..." : ""}`
      : type === "image"
        ? `🖼️ *Tipe:* Gambar${message ? ` + caption` : ""}`
        : type === "video"
          ? `🎬 *Tipe:* Video${message ? ` + caption` : ""}`
          : `📎 *Tipe:* ${type}`;

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ✅ *KONFIRMASI KIRIM*   ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📋 *Tujuan (${selectedGroups.size} grup):*\n` +
      `${selectedNames}\n\n` +
      `${preview}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Yakin ingin mengirim broadcast?`,
    footer: "📢 Broadcast Panel",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "⚙️ Konfirmasi",
          sections: [
            {
              title: "📢 Aksi Broadcast",
              rows: [
                {
                  header: "✅",
                  title: "Kirim Sekarang",
                  description: `Kirim ke ${selectedGroups.size} grup`,
                  id: "announce_send",
                },
                {
                  header: "✏️",
                  title: "Edit Pesan",
                  description: "Ubah pesan broadcast",
                  id: "announce_recompose",
                },
                {
                  header: "🔄",
                  title: "Ubah Pilihan Grup",
                  description: "Kembali ke pilih grup",
                  id: "announce_reselect",
                },
                {
                  header: "❌",
                  title: "Batal",
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
// KIRIM BROADCAST KE SEMUA GRUP TERPILIH
// ==========================================
async function executeBroadcast(sock, jid, senderNumber) {
  const state = announceState.get(senderNumber);
  if (!state) return;

  const { selectedGroups, groups, message, mediaMsg, type } = state;

  announceState.delete(senderNumber);

  const selectedGroupList = groups.filter((g) => selectedGroups.has(g.id));

  await sock.sendMessage(jid, {
    text:
      `⏳ *Mengirim broadcast...*\n` +
      `📋 Target: ${selectedGroupList.length} grup\n\n` +
      `_Mohon tunggu..._`,
  });

  let successCount = 0;
  let failCount = 0;
  const failedGroups = [];

  for (const group of selectedGroupList) {
    try {
      if (type === "text") {
        await sock.sendMessage(group.id, { text: message });
      } else if (type === "image" && mediaMsg) {
        // Re-send image
        const imgMsg = mediaMsg.message?.imageMessage;
        if (imgMsg) {
          await sock.sendMessage(group.id, {
            forward: mediaMsg,
          });
        } else {
          await sock.sendMessage(group.id, { text: message || "" });
        }
      } else if (type === "video" && mediaMsg) {
        await sock.sendMessage(group.id, {
          forward: mediaMsg,
        });
      } else {
        // Fallback: forward pesan
        if (mediaMsg) {
          await sock.sendMessage(group.id, { forward: mediaMsg });
        } else if (message) {
          await sock.sendMessage(group.id, { text: message });
        }
      }

      successCount++;
      // Delay antar grup untuk menghindari spam
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      failCount++;
      failedGroups.push(group.name);
      console.error(`❌ Gagal kirim ke ${group.name}: ${e.message}`);
    }
  }

  // Simpan ke history
  addHistory({
    senderNumber,
    type,
    message: message?.substring(0, 200) || `[${type}]`,
    targetCount: selectedGroupList.length,
    successCount,
    failCount,
    groups: selectedGroupList.map((g) => g.name),
  });

  // Laporan hasil
  let report =
    `╔══════════════════════════╗\n` +
    `║  📊 *HASIL BROADCAST*    ║\n` +
    `╚══════════════════════════╝\n\n` +
    `✅ *Berhasil:* ${successCount} grup\n` +
    `❌ *Gagal:* ${failCount} grup\n` +
    `📦 *Total:* ${selectedGroupList.length} grup\n\n`;

  if (failedGroups.length > 0) {
    report += `⚠️ *Gagal dikirim ke:*\n`;
    failedGroups.forEach((name) => {
      report += `• ${name}\n`;
    });
  }

  report += `\n⏰ ${new Date().toLocaleString("id-ID")}`;

  await sock.sendMessage(jid, { text: report });
}

// ==========================================
// ROUTER: Handle semua button announce
// ==========================================
async function handleAnnounceRouter(sock, msg, jid, senderNumber, text) {
  // Pastikan hanya private chat
  if (!jid.endsWith("@s.whatsapp.net")) return;

  if (!isOwner(senderNumber) && !isAdminBot(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  // Toggle grup
  if (text.startsWith("announce_toggle_")) {
    const groupId = text.replace("announce_toggle_", "");
    const state = announceState.get(senderNumber);
    if (!state) {
      await handleAnnounceStart(sock, jid, senderNumber);
      return;
    }

    if (state.selectedGroups.has(groupId)) {
      state.selectedGroups.delete(groupId);
    } else {
      state.selectedGroups.add(groupId);
    }
    announceState.set(senderNumber, state);
    await sendGroupSelectionMenu(sock, jid, senderNumber);
    return;
  }

  switch (text) {
    case "announce_start":
      await handleAnnounceStart(sock, jid, senderNumber);
      break;

    case "announce_select_all": {
      const state = announceState.get(senderNumber);
      if (!state) {
        await handleAnnounceStart(sock, jid, senderNumber);
        return;
      }
      state.groups.forEach((g) => state.selectedGroups.add(g.id));
      announceState.set(senderNumber, state);
      await sendGroupSelectionMenu(sock, jid, senderNumber);
      break;
    }

    case "announce_deselect_all": {
      const state = announceState.get(senderNumber);
      if (!state) return;
      state.selectedGroups.clear();
      announceState.set(senderNumber, state);
      await sendGroupSelectionMenu(sock, jid, senderNumber);
      break;
    }

    case "announce_need_select":
      await sock.sendMessage(jid, {
        text: `⚠️ *Pilih minimal 1 grup terlebih dahulu!*`,
      });
      break;

    case "announce_next_compose": {
      const state = announceState.get(senderNumber);
      if (!state) return;

      if (state.selectedGroups.size === 0) {
        await sock.sendMessage(jid, {
          text: `⚠️ *Pilih minimal 1 grup terlebih dahulu!*`,
        });
        await sendGroupSelectionMenu(sock, jid, senderNumber);
        return;
      }

      await sendComposeMenu(sock, jid, senderNumber);
      break;
    }

    case "announce_recompose": {
      const state = announceState.get(senderNumber);
      if (!state) return;
      state.step = "compose";
      state.message = null;
      state.mediaMsg = null;
      state.type = null;
      announceState.set(senderNumber, state);
      await sendComposeMenu(sock, jid, senderNumber);
      break;
    }

    case "announce_reselect": {
      const state = announceState.get(senderNumber);
      if (!state) return;
      state.step = "select_groups";
      announceState.set(senderNumber, state);
      await sendGroupSelectionMenu(sock, jid, senderNumber);
      break;
    }

    case "announce_send":
      await executeBroadcast(sock, jid, senderNumber);
      break;

    case "announce_cancel":
      announceState.delete(senderNumber);
      await sock.sendMessage(jid, {
        text: `❌ *Broadcast dibatalkan.*`,
      });
      break;

    case "announce_history":
      await handleAnnounceHistory(sock, jid, senderNumber);
      break;

    default:
      break;
  }
}

// ==========================================
// HANDLE INCOMING (Text & Media) saat state aktif
// ==========================================
async function handleAnnounceIncoming(sock, msg, jid, senderNumber) {
  // Pastikan hanya private chat
  if (!jid.endsWith("@s.whatsapp.net")) return false;

  const state = announceState.get(senderNumber);
  if (!state) return false;

  const m = msg.message;
  if (!m) return false;

  // Ambil teks dari pesan
  const rawText = (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  ).trim();

  const lowerText = rawText.toLowerCase();

  // ── Handle "batal" ──
  if (lowerText === "batal" || lowerText === "cancel") {
    announceState.delete(senderNumber);
    await sock.sendMessage(jid, { text: `❌ *Broadcast dibatalkan.*` });
    return true;
  }

  // ── Jika step = select_groups: abaikan teks biasa ──
  if (state.step === "select_groups") {
    // Hanya terima command announce yang valid
    return false;
  }

  // ── Jika step = compose: terima pesan ──
  if (state.step === "compose") {
    // Deteksi tipe pesan
    if (m.imageMessage) {
      state.type = "image";
      state.message = rawText || null; // caption
      state.mediaMsg = msg;
    } else if (m.videoMessage) {
      state.type = "video";
      state.message = rawText || null;
      state.mediaMsg = msg;
    } else if (m.documentMessage) {
      state.type = "document";
      state.message = rawText || null;
      state.mediaMsg = msg;
    } else if (m.audioMessage || m.stickerMessage) {
      state.type = m.audioMessage ? "audio" : "sticker";
      state.mediaMsg = msg;
      state.message = null;
    } else if (rawText) {
      state.type = "text";
      state.message = rawText;
      state.mediaMsg = null;
    } else {
      // Tipe tidak dikenali
      await sock.sendMessage(jid, {
        text: `⚠️ *Tipe pesan tidak didukung.*\nKirim teks, gambar, atau video.`,
      });
      return true;
    }

    state.step = "confirm";
    announceState.set(senderNumber, state);

    // Tampilkan konfirmasi
    await sendConfirmMenu(sock, jid, senderNumber);
    return true;
  }

  // ── Jika step = confirm: abaikan teks biasa ──
  if (state.step === "confirm") {
    return false;
  }

  return false;
}

// ==========================================
// RIWAYAT BROADCAST
// ==========================================
async function handleAnnounceHistory(sock, jid, senderNumber) {
  // Pastikan hanya private chat
  if (!jid.endsWith("@s.whatsapp.net")) {
    await sock.sendMessage(jid, {
      text: `⚠️ Fitur ini hanya bisa digunakan di *private chat*.`,
    });
    return;
  }

  if (!isOwner(senderNumber) && !isAdminBot(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const history = loadHistory();

  if (history.length === 0) {
    await sock.sendMessage(jid, {
      text:
        `╔══════════════════════════╗\n` +
        `║  📋 *RIWAYAT BROADCAST* ║\n` +
        `╚══════════════════════════╝\n\n` +
        `_Belum ada riwayat broadcast._`,
    });
    return;
  }

  let text =
    `╔══════════════════════════╗\n` +
    `║  📋 *RIWAYAT BROADCAST* ║\n` +
    `╚══════════════════════════╝\n\n`;

  history.slice(0, 10).forEach((h, i) => {
    const date = new Date(h.createdAt).toLocaleString("id-ID");
    text +=
      `*${i + 1}. Broadcast #${h.id}*\n` +
      `👤 Oleh: +${h.senderNumber}\n` +
      `📝 Tipe: ${h.type}\n` +
      `📦 Target: ${h.targetCount} grup\n` +
      `✅ Berhasil: ${h.successCount} | ❌ Gagal: ${h.failCount}\n` +
      `💬 Pesan: ${(h.message || "-").substring(0, 50)}${h.message?.length > 50 ? "..." : ""}\n` +
      `📅 ${date}\n\n`;
  });

  if (history.length > 10) {
    text += `_... dan ${history.length - 10} riwayat lainnya_`;
  }

  await sock.sendMessage(jid, { text });
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  announceState,
  handleAnnounceStart,
  handleAnnounceRouter,
  handleAnnounceIncoming,
  handleAnnounceHistory,
};
