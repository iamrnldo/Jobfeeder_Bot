// ==========================================
//  HANDLER.JS - Frontend
//  Command, Menu, Admin System, Jasa Website
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  setUserState,
  getUserState,
  clearUserState,
  createOrder,
} = require("./database");
const pakasir = require("./pakasir");

// ==========================================
// PATH DATABASE ADMIN
// ==========================================
const ADMIN_DB_PATH = path.join(__dirname, "database", "admin.json");

// ==========================================
// DAFTAR PAKET JASA WEBSITE
// ==========================================
const websitePackages = {
  1: {
    id: 1,
    name: "Landing Page Starter",
    price: 1400000,
    duration: "2 hari",
    revision: "Tak terbatas",
    description:
      "Website 1 halaman (Single Page) statis yang responsif dan modern. Sangat pas untuk Personal Branding atau Landing Page produk.",
    features: [
      "1 Halaman Landing Page",
      "Desain Responsif (Mobile & Desktop)",
      "Integrasi Social Media",
      "Teknologi HTML/Tailwind CSS/JS/API",
      "Source Code",
    ],
  },
  2: {
    id: 2,
    name: "Custom Dynamic Web",
    price: 2500000,
    duration: "20 hari",
    revision: "7 kali",
    description:
      "Website dinamis dengan dashboard admin. Cocok untuk sistem administrasi persuratan, kasir sederhana, atau manajemen data.",
    features: [
      "Hingga 5 Halaman Utama",
      "Dashboard Admin & Login User",
      "Database MySQL & Integrasi API",
      "Framework Laravel (PHP)",
      "Manajemen CRUD (Input, Edit, Hapus Data)",
    ],
  },
  3: {
    id: 3,
    name: "Full-Service Premium Web",
    price: 3500000,
    duration: "30 hari",
    revision: "20 kali",
    description:
      "Solusi lengkap dari desain UI/UX di Figma hingga pengembangan sistem kustom yang kompleks (misal: Spasial/Peta atau E-Commerce).",
    features: [
      "Desain UI/UX Kustom via Figma",
      "Fitur Kompleks (QRCode, Notifikasi, Spasial/Leaflet.js)",
      "Keamanan & Validasi Input User",
      "Dokumentasi Penggunaan Sistem",
      "Maintenance & Support 1 Bulan",
    ],
  },
};

// ==========================================
// ADMIN DATABASE FUNCTIONS
// ==========================================

/**
 * Load daftar admin dari file JSON
 * @returns {string[]} Array nomor admin
 */
function loadAdmins() {
  try {
    const dir = path.dirname(ADMIN_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ADMIN_DB_PATH)) {
      fs.writeFileSync(ADMIN_DB_PATH, "[]");
      return [];
    }
    return JSON.parse(fs.readFileSync(ADMIN_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Simpan daftar admin ke file JSON
 * @param {string[]} admins - Array nomor admin
 */
function saveAdmins(admins) {
  const dir = path.dirname(ADMIN_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ADMIN_DB_PATH, JSON.stringify(admins, null, 2));
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Bersihkan nomor: hapus +, spasi, strip
 * Contoh: "+62 877-1901-0818" → "6287719010818"
 */
function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

/**
 * Ambil nomor dari JID
 * "6287719010818@s.whatsapp.net" → "6287719010818"
 */
function getNumberFromJid(jid) {
  return jid.split("@")[0];
}

/**
 * Format nomor jadi JID
 * "6287719010818" → "6287719010818@s.whatsapp.net"
 */
function numberToJid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

/**
 * Cek apakah nomor adalah OWNER
 */
function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

/**
 * Cek apakah nomor adalah ADMIN
 */
function isAdmin(number) {
  const admins = loadAdmins();
  const normalized = normalizeNumber(number);
  return admins.some((a) => normalizeNumber(a) === normalized);
}

/**
 * Cek apakah nomor adalah ADMIN atau OWNER
 */
function isAdminOrOwner(number) {
  return isOwner(number) || isAdmin(number);
}

// ==========================================
// FUNGSI JASA WEBSITE
// ==========================================

/**
 * Kirim menu pilihan paket website
 */
async function sendWebsiteMenu(sock, jid) {
  let text = `╔═══════════════════════════════╗\n`;
  text += `║  🌐 *JASA PEMBUATAN WEBSITE*  ║\n`;
  text += `╚═══════════════════════════════╝\n\n`;
  text += `Pilih paket yang sesuai dengan kebutuhan Anda:\n\n`;

  for (const [key, pkg] of Object.entries(websitePackages)) {
    text += `*${key}.* ${pkg.name}\n`;
    text += `   💰 Rp${pkg.price.toLocaleString()}\n`;
    text += `   ⏰ ${pkg.duration} • 🔄 ${pkg.revision}\n\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Balas angka *1*, *2*, atau *3* untuk memilih paket._\n`;
  text += `_Ketik *0* untuk batal._`;

  await sock.sendMessage(jid, { text });
}

/**
 * Kirim detail paket website
 */
async function sendPackageDetail(sock, jid, packageId) {
  const pkg = websitePackages[packageId];
  if (!pkg) return false;

  let text = `📦 *${pkg.name}*\n\n`;
  text += `${pkg.description}\n\n`;
  text += `*Detail:*\n`;
  text += `💰 Harga: Rp${pkg.price.toLocaleString()}\n`;
  text += `⏰ Waktu pengerjaan: ${pkg.duration}\n`;
  text += `🔄 Revisi: ${pkg.revision}\n\n`;
  text += `*Yang akan Anda terima:*\n`;
  pkg.features.forEach((f) => {
    text += `✓ ${f}\n`;
  });
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Ketik *YA* untuk memesan paket ini, atau *TIDAK* untuk batal._`;

  await sock.sendMessage(jid, { text });
  return true;
}

/**
 * Proses alur pemesanan website (state-based)
 */
async function handleWebsiteOrder(sock, msg, jid, senderNumber, sender, text) {
  const currentState = getUserState(senderNumber);
  const lowerText = text.toLowerCase().trim();

  // State 0: Belum memilih paket (select_package)
  if (!currentState || currentState.step === "select_package") {
    if (lowerText === "0") {
      await sock.sendMessage(jid, { text: "❌ Pemesanan dibatalkan." });
      clearUserState(senderNumber);
      return;
    }
    const selected = parseInt(text);
    if (selected && websitePackages[selected]) {
      setUserState(senderNumber, {
        step: "confirm_package",
        packageId: selected,
        packageName: websitePackages[selected].name,
        price: websitePackages[selected].price,
        duration: websitePackages[selected].duration,
      });
      await sendPackageDetail(sock, jid, selected);
    } else {
      await sock.sendMessage(jid, {
        text: "❌ Pilihan tidak valid. Silakan pilih angka 1, 2, atau 3.",
      });
    }
    return;
  }

  // State 1: Konfirmasi paket
  if (currentState.step === "confirm_package") {
    if (lowerText === "ya") {
      setUserState(senderNumber, { ...currentState, step: "ask_name" });
      await sock.sendMessage(jid, {
        text: "📝 Silakan masukkan *nama lengkap* Anda untuk keperluan invoice:",
      });
    } else if (lowerText === "tidak") {
      await sock.sendMessage(jid, {
        text: "❌ Pemesanan dibatalkan. Ketik *menu* untuk kembali.",
      });
      clearUserState(senderNumber);
    } else {
      await sock.sendMessage(jid, {
        text: "❌ Silakan ketik *YA* untuk melanjutkan atau *TIDAK* untuk batal.",
      });
    }
    return;
  }

  // State 2: Minta nama
  if (currentState.step === "ask_name") {
    if (text.length < 3) {
      await sock.sendMessage(jid, {
        text: "❌ Nama terlalu pendek. Masukkan nama lengkap (minimal 3 huruf):",
      });
      return;
    }
    setUserState(senderNumber, {
      ...currentState,
      customerName: text,
      step: "ask_email",
    });
    await sock.sendMessage(jid, {
      text: "📧 Masukkan *alamat email* (opsional, kosongkan dengan ketik *-*):",
    });
    return;
  }

  // State 3: Minta email
  if (currentState.step === "ask_email") {
    let email = text === "-" ? "" : text;
    setUserState(senderNumber, {
      ...currentState,
      customerEmail: email,
      step: "processing_payment",
    });

    await sock.sendMessage(jid, {
      text: "⏳ Sedang menyiapkan invoice pembayaran, mohon tunggu sebentar...",
    });

    try {
      const invoice = await pakasir.createOrder({
        amount: currentState.price,
        customer_name: currentState.customerName,
        customer_email: currentState.customerEmail,
        customer_phone: senderNumber,
        description: `Pembayaran untuk paket ${currentState.packageName}`,
      });

      const order = createOrder({
        userJid: jid,
        userNumber: senderNumber,
        packageId: currentState.packageId,
        packageName: currentState.packageName,
        amount: currentState.price,
        estimatedTime: currentState.duration,
        pakasirOrderId: invoice.id,
        checkoutUrl: invoice.checkout_url,
        qrCodeUrl: invoice.qr_code_url,
        status: "pending",
      });

      let paymentMessage = `💳 *INVOICE PEMBAYARAN*\n\n`;
      paymentMessage += `Halo *${currentState.customerName}*,\n`;
      paymentMessage += `Anda memesan paket *${currentState.packageName}*.\n`;
      paymentMessage += `Total tagihan: *Rp${currentState.price.toLocaleString()}*\n\n`;
      paymentMessage += `Silakan lakukan pembayaran melalui QRIS di bawah ini atau klik tautan berikut:\n`;
      paymentMessage += `🔗 ${invoice.checkout_url}\n\n`;
      paymentMessage += `*ID Transaksi:* ${order.id}\n`;
      paymentMessage += `*Status:* Menunggu pembayaran\n\n`;
      paymentMessage += `_Pembayaran akan otomatis terkonfirmasi. Setelah sukses, Anda akan menerima notifikasi._`;

      if (invoice.qr_code_url) {
        await sock.sendMessage(jid, {
          image: { url: invoice.qr_code_url },
          caption: paymentMessage,
        });
      } else {
        await sock.sendMessage(jid, { text: paymentMessage });
      }

      clearUserState(senderNumber);
    } catch (err) {
      console.error("PAKASIR error:", err);
      await sock.sendMessage(jid, {
        text: "❌ Maaf, terjadi kesalahan saat membuat invoice. Silakan coba lagi nanti.",
      });
      clearUserState(senderNumber);
    }
    return;
  }

  // Fallback: reset state
  clearUserState(senderNumber);
  await sock.sendMessage(jid, {
    text: "Sesi pemesanan kadaluarsa. Silakan ketik *website* untuk memulai lagi.",
  });
}

// ==========================================
// HANDLER UTAMA
// ==========================================
async function handleMessage(sock, msg) {
  if (msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const sender = msg.pushName || "Unknown";

  // Ambil nomor bot & sender
  const botId = sock.user?.id?.replace(/:.*@/, "@") || "";
  const botNumber = botId.split("@")[0];
  const senderNumber = getNumberFromJid(
    msg.key.participant || msg.key.remoteJid,
  );

  // Extract teks
  let text = extractText(msg);
  let rawText = text.trim();
  text = text.toLowerCase().trim();

  // Cek mention bot
  const isBotMentioned = checkBotMentioned(msg, botNumber);

  console.log(
    `📩 Pesan dari ${sender} (${senderNumber}): ${text || "[non-text]"}`,
  );

  if (!text) return;

  // ==========================================
  // Cek apakah user sedang dalam proses pemesanan website
  // ==========================================
  const userState = getUserState(senderNumber);
  if (userState && userState.step && userState.step !== "select_package") {
    await handleWebsiteOrder(sock, msg, jid, senderNumber, sender, text);
    return;
  }

  // ==========================================
  // PARAMETERIZED COMMANDS (admin)
  // ==========================================
  if (text.startsWith("/addadmin ") || text.startsWith("addadmin ")) {
    await handleAddAdmin(sock, msg, jid, senderNumber, rawText);
    return;
  }

  if (text.startsWith("/deladmin ") || text.startsWith("deladmin ")) {
    await handleDelAdmin(sock, jid, senderNumber, rawText);
    return;
  }

  if (text.startsWith("deladmin_")) {
    await handleDelAdminFromList(sock, jid, senderNumber, text);
    return;
  }

  // ==========================================
  // ROUTING COMMAND (exact match)
  // ==========================================
  try {
    switch (text) {
      // ============ MENU UTAMA ============
      case "menu":
      case "/menu":
      case "help":
      case "/help":
        await sendMainMenu(sock, jid, sender, senderNumber);
        break;

      // ============ JASA WEBSITE ============
      case "website":
      case "/website":
      case "jasa website":
        await sendWebsiteMenu(sock, jid);
        setUserState(senderNumber, { step: "select_package" });
        break;

      // ============ DEMO FITUR ============
      case "button":
      case "/button":
        await sendButtonMessage(sock, jid);
        break;

      case "list":
      case "/list":
        await sendListMessage(sock, jid);
        break;

      case "template":
      case "/template":
        await sendTemplateButton(sock, jid);
        break;

      case "image":
      case "/image":
        await sendImageWithButton(sock, jid);
        break;

      // ============ RESPONSE INTERACTIVE MENU ============
      case "menu_button":
        await sendButtonMessage(sock, jid);
        break;

      case "menu_list":
        await sendListMessage(sock, jid);
        break;

      case "menu_template":
        await sendTemplateButton(sock, jid);
        break;

      case "menu_image":
        await sendImageWithButton(sock, jid);
        break;

      case "menu_info":
        await sock.sendMessage(jid, {
          text:
            "📌 *INFO BOT*\n\n" +
            `Bot ini dibuat menggunakan atexovi-baileys.\n\n` +
            `• *Nama:* ${config.botName}\n` +
            `• *Version:* ${config.version}\n` +
            `• *Library:* atexovi-baileys\n` +
            `• *Runtime:* Node.js`,
        });
        break;

      case "menu_ping":
        const pingStart = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 *PONG!*\n\nSpeed: ${Date.now() - pingStart}ms\nStatus: Online ✅`,
        });
        break;

      case "menu_creator":
        await sock.sendMessage(jid, {
          text:
            "👨‍💻 *CREATOR*\n\n" +
            "Bot dibuat oleh Developer\n" +
            "GitHub: https://github.com/iamrnldo",
        });
        break;

      // ============ ADMIN PANEL ============
      case "admin_add":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sock.sendMessage(jid, {
          text:
            "➕ *ADD ADMIN*\n\n" +
            "Gunakan salah satu cara berikut:\n\n" +
            "📝 *Cara 1:* Ketik nomor\n" +
            "```/addadmin 628xxxxxxxxxx```\n\n" +
            "📝 *Cara 2:* Tag user (di grup)\n" +
            "```/addadmin @user```\n\n" +
            "⚠️ Format nomor: 628xxxxx (tanpa +)",
        });
        break;

      case "admin_del":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sendAdminDeleteList(sock, jid, senderNumber);
        break;

      case "admin_list":
      case "/listadmin":
      case "listadmin":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sendAdminList(sock, jid);
        break;

      // ============ RESPONSE BUTTON MESSAGE ============
      case "btn_info":
        await sock.sendMessage(jid, {
          text:
            "📌 *INFO BOT*\n\n" +
            "Bot ini dibuat menggunakan atexovi-baileys.\n" +
            "Bot mendukung button, list, dan template message!",
        });
        break;

      case "btn_creator":
        await sock.sendMessage(jid, {
          text:
            "👨‍💻 *CREATOR*\n\n" +
            "Bot dibuat oleh Developer\n" +
            "GitHub: https://github.com/iamrnldo",
        });
        break;

      case "btn_ping":
        const start = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong!\nSpeed: ${Date.now() - start}ms`,
        });
        break;

      // ============ RESPONSE LIST MESSAGE ============
      case "list_games":
        await sock.sendMessage(jid, {
          text:
            "🎮 *FITUR GAMES*\n\n" +
            "• Tebak Gambar\n• Tebak Kata\n• Quiz\n\n_Coming Soon!_",
        });
        break;

      case "list_tools":
        await sock.sendMessage(jid, {
          text:
            "🔧 *FITUR TOOLS*\n\n" +
            "• Sticker Maker\n• Image to PDF\n• QR Generator\n\n_Coming Soon!_",
        });
        break;

      case "list_downloader":
        await sock.sendMessage(jid, {
          text:
            "📥 *FITUR DOWNLOADER*\n\n" +
            "• YouTube Downloader\n• Instagram Downloader\n• TikTok Downloader\n\n_Coming Soon!_",
        });
        break;

      case "list_info":
        await sock.sendMessage(jid, {
          text:
            "📋 *INFO*\n\n" +
            `Bot Version: ${config.version}\n` +
            "Library: atexovi-baileys\nRuntime: Node.js",
        });
        break;

      // ============ DEFAULT ============
      default:
        if (isBotMentioned) {
          await sock.sendMessage(jid, {
            text:
              `👋 Halo *${sender}*!\n\n` +
              `Ketik *menu* untuk melihat daftar perintah.\n\n` +
              `Bot ini mendukung:\n` +
              `• Interactive List Button\n` +
              `• Button Message\n` +
              `• List Message\n` +
              `• Template Button\n` +
              `• Jasa Pembuatan Website (ketik *website*)`,
          });
        }
        break;
    }
  } catch (error) {
    console.error("❗ Error handling message:", error);
  }
}

// ==========================================
// ADMIN: HANDLE ADD ADMIN
// ==========================================
async function handleAddAdmin(sock, msg, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa menambah admin.",
    });
    return;
  }

  let targetNumber = "";
  const mentionedJids =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  if (mentionedJids.length > 0) {
    targetNumber = getNumberFromJid(mentionedJids[0]);
  } else {
    const parts = rawText.split(/\s+/);
    if (parts.length >= 2) {
      targetNumber = normalizeNumber(parts[1]);
    }
  }

  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text:
        "❌ *FORMAT SALAH*\n\n" +
        "Gunakan:\n" +
        "```/addadmin 628xxxxxxxxxx```\n" +
        "atau tag user:\n" +
        "```/addadmin @user```",
    });
    return;
  }

  if (isOwner(targetNumber)) {
    await sock.sendMessage(jid, {
      text: "👑 Nomor tersebut adalah *Owner*, tidak perlu dijadikan admin.",
    });
    return;
  }

  if (isAdmin(targetNumber)) {
    await sock.sendMessage(jid, {
      text: `⚠️ Nomor *${targetNumber}* sudah menjadi admin.`,
    });
    return;
  }

  const admins = loadAdmins();
  admins.push(targetNumber);
  saveAdmins(admins);

  console.log(`✅ Admin ditambahkan: ${targetNumber} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `✅ *ADMIN DITAMBAHKAN*\n\n` +
      `📱 Nomor: ${targetNumber}\n` +
      `👤 Ditambahkan oleh: ${senderNumber}\n` +
      `📊 Total admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: HANDLE DELETE ADMIN (dari command)
// ==========================================
async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa menghapus admin.",
    });
    return;
  }

  const parts = rawText.split(/\s+/);
  let targetNumber = "";

  if (parts.length >= 2) {
    targetNumber = normalizeNumber(parts[1]);
  }

  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text:
        "❌ *FORMAT SALAH*\n\n" +
        "Gunakan:\n" +
        "```/deladmin 628xxxxxxxxxx```\n\n" +
        "Atau pilih dari menu:\n" +
        "Ketik */menu* → Admin Panel → Delete Admin",
    });
    return;
  }

  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

// ==========================================
// ADMIN: HANDLE DELETE DARI INTERACTIVE LIST
// ==========================================
async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }

  const targetNumber = text.replace("deladmin_", "");
  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

// ==========================================
// ADMIN: EXECUTE DELETE (shared logic)
// ==========================================
async function executeDeleteAdmin(sock, jid, senderNumber, targetNumber) {
  if (isOwner(targetNumber)) {
    await sock.sendMessage(jid, {
      text:
        "⛔ *TIDAK BISA MENGHAPUS OWNER*\n\n" +
        `👑 Nomor *${targetNumber}* adalah Owner bot.\n` +
        "Owner tidak bisa dihapus oleh siapapun.",
    });
    return;
  }

  if (!isAdmin(targetNumber)) {
    await sock.sendMessage(jid, {
      text: `❌ Nomor *${targetNumber}* bukan admin.`,
    });
    return;
  }

  if (normalizeNumber(senderNumber) === normalizeNumber(targetNumber)) {
    await sock.sendMessage(jid, {
      text: "❌ Tidak bisa menghapus diri sendiri.",
    });
    return;
  }

  let admins = loadAdmins();
  admins = admins.filter(
    (a) => normalizeNumber(a) !== normalizeNumber(targetNumber),
  );
  saveAdmins(admins);

  console.log(`🗑️ Admin dihapus: ${targetNumber} oleh ${senderNumber}`);

  await sock.sendMessage(jid, {
    text:
      `🗑️ *ADMIN DIHAPUS*\n\n` +
      `📱 Nomor: ${targetNumber}\n` +
      `👤 Dihapus oleh: ${senderNumber}\n` +
      `📊 Sisa admin: ${admins.length}`,
  });
}

// ==========================================
// ADMIN: KIRIM LIST ADMIN
// ==========================================
async function sendAdminList(sock, jid) {
  const admins = loadAdmins();

  let text =
    `╔══════════════════════╗\n` +
    `║  🔐 *DAFTAR ADMIN*   ║\n` +
    `╚══════════════════════╝\n\n`;

  text += `👑 *OWNER:*\n`;
  text += `└ 📱 ${config.ownerNumber}\n\n`;

  text += `🛡️ *ADMIN (${admins.length}):*\n`;

  if (admins.length === 0) {
    text += `└ _Belum ada admin_\n`;
  } else {
    admins.forEach((admin, index) => {
      const prefix = index === admins.length - 1 ? "└" : "├";
      text += `${prefix} 📱 ${admin}\n`;
    });
  }

  text += `\n📊 *Total:* ${admins.length + 1} (termasuk owner)`;

  await sock.sendMessage(jid, { text });
}

// ==========================================
// ADMIN: KIRIM INTERACTIVE LIST UNTUK DELETE
// ==========================================
async function sendAdminDeleteList(sock, jid, senderNumber) {
  const admins = loadAdmins();
  const deletableAdmins = admins.filter((admin) => !isOwner(admin));

  if (deletableAdmins.length === 0) {
    await sock.sendMessage(jid, {
      text:
        "📋 *DELETE ADMIN*\n\n" +
        "_Tidak ada admin yang bisa dihapus (selain Owner)._\n\n" +
        "Tambah admin dulu dengan:\n" +
        "```/addadmin 628xxxxxxxxxx```",
    });
    return;
  }

  const rows = deletableAdmins.map((admin, index) => ({
    header: `Admin #${index + 1}`,
    title: admin,
    description: `Hapus ${admin} dari daftar admin`,
    id: `deladmin_${admin}`,
  }));

  await sock.sendMessage(jid, {
    text:
      `🗑️ *DELETE ADMIN*\n\n` +
      `Pilih admin yang ingin dihapus dari daftar.\n` +
      `Total admin yang bisa dihapus: *${deletableAdmins.length}*\n\n` +
      `👑 _Owner (${config.ownerNumber}) tidak bisa dihapus._`,
    title: "Hapus Admin",
    subtitle: "Pilih admin untuk dihapus",
    footer: "⚠️ Owner dilindungi, tidak bisa dihapus",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Admin",
          sections: [
            {
              title: "🛡️ Daftar Admin (tanpa Owner)",
              highlight_label: `${deletableAdmins.length} Admin`,
              rows: rows,
            },
          ],
        }),
      },
    ],
  });
}

// ==========================================
// EXTRACT TEXT DARI BERBAGAI FORMAT PESAN
// ==========================================
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.buttonsResponseMessage?.selectedButtonId)
    return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId)
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.templateButtonReplyMessage?.selectedId)
    return m.templateButtonReplyMessage.selectedId;

  if (m.interactiveResponseMessage) {
    try {
      const body =
        m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
      if (body) {
        const parsed = JSON.parse(body);
        return parsed.id || "";
      }
    } catch (e) {
      console.error("Error parsing interactive response:", e);
    }
  }

  return "";
}

// ==========================================
// CEK BOT DI-MENTION
// ==========================================
function checkBotMentioned(msg, botNumber) {
  const m = msg.message;
  if (!m) return false;

  const mentionedJids = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
  for (const mentioned of mentionedJids) {
    if (mentioned.startsWith(botNumber)) return true;
  }

  let text = "";
  if (m.conversation) text = m.conversation;
  if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;

  return text.includes(`@${botNumber}`);
}

// ==========================================
// ⭐ MENU UTAMA - INTERACTIVE LIST
// ==========================================
async function sendMainMenu(sock, jid, sender, senderNumber) {
  const sections = [
    {
      title: "📨 Fitur Message",
      highlight_label: "Populer",
      rows: [
        {
          header: "🔘 Button",
          title: "Button Message",
          description: "Kirim pesan dengan tombol interaktif",
          id: "menu_button",
        },
        {
          header: "📋 List",
          title: "List Message",
          description: "Kirim pesan dengan daftar pilihan",
          id: "menu_list",
        },
        {
          header: "📎 Template",
          title: "Template Button",
          description: "URL, Call, dan Quick Reply button",
          id: "menu_template",
        },
        {
          header: "🖼️ Image",
          title: "Image + Button",
          description: "Kirim gambar dengan tombol",
          id: "menu_image",
        },
      ],
    },
    {
      title: "🌐 Layanan",
      rows: [
        {
          header: "💻 Website",
          title: "Jasa Pembuatan Website",
          description: "Lihat paket dan harga website",
          id: "website",
        },
      ],
    },
    {
      title: "ℹ️ Informasi",
      rows: [
        {
          header: "📌 Info",
          title: "Info Bot",
          description: "Lihat informasi lengkap tentang bot",
          id: "menu_info",
        },
        {
          header: "👨‍💻 Dev",
          title: "Creator",
          description: "Informasi pembuat bot",
          id: "menu_creator",
        },
      ],
    },
    {
      title: "⚡ Utilities",
      rows: [
        {
          header: "🏓 Ping",
          title: "Speed Test",
          description: "Cek kecepatan response bot",
          id: "menu_ping",
        },
      ],
    },
  ];

  if (isAdminOrOwner(senderNumber)) {
    const admins = loadAdmins();
    const roleLabel = isOwner(senderNumber) ? "👑 Owner" : "🛡️ Admin";

    sections.push({
      title: `🔐 Admin Panel [${roleLabel}]`,
      highlight_label: "Restricted",
      rows: [
        {
          header: "➕ Add",
          title: "Tambah Admin",
          description: "Tambahkan admin baru ke bot",
          id: "admin_add",
        },
        {
          header: "➖ Delete",
          title: "Hapus Admin",
          description: `Hapus admin (saat ini: ${admins.length} admin)`,
          id: "admin_del",
        },
        {
          header: "📋 List",
          title: "Daftar Admin",
          description: "Lihat semua admin yang terdaftar",
          id: "admin_list",
        },
      ],
    });
  }

  const roleText = isOwner(senderNumber)
    ? "👑 Role: *Owner*"
    : isAdmin(senderNumber)
      ? "🛡️ Role: *Admin*"
      : "👤 Role: *User*";

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════╗\n` +
      `║  🤖 *MENU BOT WA*   ║\n` +
      `╚══════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n` +
      `${roleText}\n\n` +
      `⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n\n` +
      `Silakan pilih menu dari daftar di bawah 👇`,
    title: config.botName,
    subtitle: "Pilih salah satu fitur",
    footer: `© 2024 ${config.botName} | atexovi-baileys`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Buka Daftar Menu",
          sections: sections,
        }),
      },
    ],
  });
}

// ==========================================
// BUTTON MESSAGE
// ==========================================
async function sendButtonMessage(sock, jid) {
  const buttons = [
    {
      buttonId: "btn_info",
      buttonText: { displayText: "📌 Info Bot" },
      type: 1,
    },
    {
      buttonId: "btn_creator",
      buttonText: { displayText: "👨‍💻 Creator" },
      type: 1,
    },
    { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
  ];

  await sock.sendMessage(jid, {
    text:
      "🔘 *BUTTON MESSAGE*\n\n" +
      "Ini adalah contoh Button Message.\n" +
      "Silakan tekan salah satu tombol di bawah!",
    footer: "Pilih salah satu button 👇",
    buttons,
    headerType: 1,
  });
}

// ==========================================
// LIST MESSAGE
// ==========================================
async function sendListMessage(sock, jid) {
  const sections = [
    {
      title: "🎮 Games",
      rows: [
        {
          title: "🎮 Games",
          rowId: "list_games",
          description: "Fitur game seru di bot",
        },
      ],
    },
    {
      title: "🔧 Tools",
      rows: [
        {
          title: "🔧 Tools",
          rowId: "list_tools",
          description: "Berbagai tools berguna",
        },
      ],
    },
    {
      title: "📥 Downloader",
      rows: [
        {
          title: "📥 Downloader",
          rowId: "list_downloader",
          description: "Download video & audio",
        },
      ],
    },
    {
      title: "📋 Information",
      rows: [
        {
          title: "📋 Info Bot",
          rowId: "list_info",
          description: "Informasi tentang bot",
        },
      ],
    },
  ];

  await sock.sendMessage(jid, {
    text:
      "📋 *LIST MESSAGE*\n\n" +
      "Ini adalah contoh List Message.\n" +
      "Tekan tombol di bawah untuk melihat daftar fitur!",
    footer: "© 2024 Bot WhatsApp",
    title: "Menu List",
    buttonText: "📋 Lihat Daftar Menu",
    sections,
  });
}

// ==========================================
// TEMPLATE BUTTON
// ==========================================
async function sendTemplateButton(sock, jid) {
  const templateButtons = [
    {
      index: 1,
      urlButton: {
        displayText: "🌐 GitHub Repository",
        url: "https://github.com/atex-ovi/atexovi-baileys",
      },
    },
    {
      index: 2,
      callButton: {
        displayText: "📞 Hubungi Kami",
        phoneNumber: "+6281234567890",
      },
    },
    {
      index: 3,
      quickReplyButton: { displayText: "🔄 Quick Reply", id: "btn_info" },
    },
  ];

  await sock.sendMessage(jid, {
    text:
      "📎 *TEMPLATE BUTTON*\n\n" +
      "Ini adalah contoh Template Button Message.\n" +
      "Ada 3 jenis button:\n\n" +
      "• 🌐 URL Button (buka link)\n" +
      "• 📞 Call Button (telepon)\n" +
      "• 🔄 Quick Reply Button",
    footer: "© 2024 Bot WhatsApp",
    templateButtons,
  });
}

// ==========================================
// IMAGE + BUTTON
// ==========================================
async function sendImageWithButton(sock, jid) {
  const buttons = [
    { buttonId: "btn_info", buttonText: { displayText: "📌 Info" }, type: 1 },
    { buttonId: "btn_ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
  ];

  await sock.sendMessage(jid, {
    image: { url: "https://picsum.photos/500/300" },
    caption:
      "🖼️ *IMAGE + BUTTON*\n\nIni adalah contoh pesan gambar dengan button!",
    footer: "© 2024 Bot WhatsApp",
    buttons,
    headerType: 4,
  });
}

// ==========================================
// EXPORT
// ==========================================
module.exports = { handleMessage };
