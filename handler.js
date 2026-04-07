// ==========================================
//  HANDLER.JS - Frontend
//  Command, Menu, Admin System, Jasa Website
// ==========================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  getUserState,
  setUserState,
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
// HELPER FUNCTIONS
// ==========================================

function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

function getNumberFromJid(jid) {
  return jid.split("@")[0];
}

function numberToJid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

function isOwner(number) {
  return normalizeNumber(number) === normalizeNumber(config.ownerNumber);
}

function isAdmin(number) {
  const admins = loadAdmins();
  const normalized = normalizeNumber(number);
  return admins.some((a) => normalizeNumber(a) === normalized);
}

function isAdminOrOwner(number) {
  return isOwner(number) || isAdmin(number);
}

// ==========================================
// MENU JASA WEBSITE DENGAN INTERACTIVE LIST BUTTON
// ==========================================
async function sendWebsiteMenuWithButton(sock, jid, sender) {
  const sections = [
    {
      title: "🌐 Pilih Paket Website",
      highlight_label: "3 Paket",
      rows: [
        {
          header: "📄 Landing Page Starter",
          title: "Rp1.400.000",
          description: "2 hari • Revisi tak terbatas • 1 halaman statis",
          id: "pkg_1",
        },
        {
          header: "💻 Custom Dynamic Web",
          title: "Rp2.500.000",
          description: "20 hari • 7x revisi • Dashboard admin",
          id: "pkg_2",
        },
        {
          header: "🚀 Full-Service Premium",
          title: "Rp3.500.000",
          description: "30 hari • 20x revisi • Fitur kompleks",
          id: "pkg_3",
        },
      ],
    },
  ];

  await sock.sendMessage(jid, {
    text: `╔═══════════════════════════════╗\n║  🌐 *JASA PEMBUATAN WEBSITE*  ║\n╚═══════════════════════════════╝\n\nHalo *${sender}*! 👋\n\nSilakan pilih paket yang sesuai dengan kebutuhan Anda.\n\nKlik tombol di bawah untuk melihat detail paket.`,
    footer: `© 2024 ${config.botName} | Payment via PAKASIR`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Paket Website",
          sections: sections,
        }),
      },
    ],
  });
}

// ==========================================
// DETAIL PAKET + BUTTON KONFIRMASI
// ==========================================
async function sendPackageDetailWithButtons(sock, jid, packageId) {
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
  text += `Apakah Anda ingin memesan paket ini?`;

  const buttons = [
    {
      buttonId: `confirm_${packageId}`,
      buttonText: { displayText: "✅ Ya, Pesan Sekarang" },
      type: 1,
    },
    {
      buttonId: `cancel_order`,
      buttonText: { displayText: "❌ Batal" },
      type: 1,
    },
  ];

  await sock.sendMessage(jid, {
    text: text,
    footer: "Pilih salah satu tombol di bawah",
    buttons: buttons,
    headerType: 1,
  });
  return true;
}

// ==========================================
// HANDLE PILIHAN PAKET DARI INTERACTIVE LIST
// ==========================================
async function handlePackageSelection(sock, jid, senderNumber, selectedId) {
  const match = selectedId.match(/pkg_(\d+)/);
  if (!match) return false;
  const packageId = parseInt(match[1]);
  const pkg = websitePackages[packageId];
  if (!pkg) return false;

  setUserState(senderNumber, {
    step: "confirm_package",
    packageId: packageId,
    packageName: pkg.name,
    price: pkg.price,
    duration: pkg.duration,
  });

  await sendPackageDetailWithButtons(sock, jid, packageId);
  return true;
}

// ==========================================
// HANDLE KONFIRMASI PESANAN (BUTTON)
// ==========================================
async function handleOrderConfirmation(sock, jid, senderNumber, buttonId) {
  if (buttonId === "cancel_order") {
    await sock.sendMessage(jid, {
      text: "❌ Pemesanan dibatalkan. Ketik *menu* untuk kembali.",
    });
    clearUserState(senderNumber);
    return;
  }

  if (buttonId.startsWith("confirm_")) {
    const packageId = buttonId.split("_")[1];
    const currentState = getUserState(senderNumber);
    if (!currentState || currentState.packageId != packageId) {
      await sock.sendMessage(jid, {
        text: "❌ Sesi tidak valid. Silakan pilih paket ulang dengan mengetik *website*.",
      });
      clearUserState(senderNumber);
      return;
    }
    // Lanjut ke minta nama
    setUserState(senderNumber, { ...currentState, step: "ask_name" });
    await sock.sendMessage(jid, {
      text: "📝 Silakan masukkan *nama lengkap* Anda untuk keperluan invoice:",
    });
    return;
  }
}

// ==========================================
// HANDLE INPUT NAMA
// ==========================================
async function handleNameInput(sock, jid, senderNumber, name) {
  const currentState = getUserState(senderNumber);
  if (!currentState || currentState.step !== "ask_name") return false;
  if (name.length < 3) {
    await sock.sendMessage(jid, {
      text: "❌ Nama terlalu pendek. Masukkan nama lengkap (minimal 3 huruf):",
    });
    return true;
  }
  setUserState(senderNumber, {
    ...currentState,
    customerName: name,
    step: "ask_email",
  });
  await sock.sendMessage(jid, {
    text: "📧 Masukkan *alamat email* (opsional, kosongkan dengan ketik *-*):",
  });
  return true;
}

// ==========================================
// HANDLE INPUT EMAIL & PROSES PEMBAYARAN
// ==========================================
async function handleEmailAndPayment(sock, jid, senderNumber, emailInput) {
  const currentState = getUserState(senderNumber);
  if (!currentState || currentState.step !== "ask_email") return false;

  let email = emailInput === "-" ? "" : emailInput;
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
      customer_email: email,
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
    console.error(err);
    await sock.sendMessage(jid, {
      text: "❌ Maaf, terjadi kesalahan saat membuat invoice. Silakan coba lagi nanti.",
    });
    clearUserState(senderNumber);
  }
  return true;
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
    if (parts.length >= 2) targetNumber = normalizeNumber(parts[1]);
  }
  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text: "❌ *FORMAT SALAH*\n\nGunakan:\n```/addadmin 628xxxxxxxxxx```\natau tag user:\n```/addadmin @user```",
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
  await sock.sendMessage(jid, {
    text: `✅ *ADMIN DITAMBAHKAN*\n\n📱 Nomor: ${targetNumber}\n👤 Ditambahkan oleh: ${senderNumber}\n📊 Total admin: ${admins.length}`,
  });
}

async function handleDelAdmin(sock, jid, senderNumber, rawText) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, {
      text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa menghapus admin.",
    });
    return;
  }
  const parts = rawText.split(/\s+/);
  let targetNumber = "";
  if (parts.length >= 2) targetNumber = normalizeNumber(parts[1]);
  if (!targetNumber || targetNumber.length < 10) {
    await sock.sendMessage(jid, {
      text: "❌ *FORMAT SALAH*\n\nGunakan:\n```/deladmin 628xxxxxxxxxx```\n\nAtau pilih dari menu:\nKetik */menu* → Admin Panel → Delete Admin",
    });
    return;
  }
  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

async function handleDelAdminFromList(sock, jid, senderNumber, text) {
  if (!isAdminOrOwner(senderNumber)) {
    await sock.sendMessage(jid, { text: "⛔ *AKSES DITOLAK*" });
    return;
  }
  const targetNumber = text.replace("deladmin_", "");
  await executeDeleteAdmin(sock, jid, senderNumber, targetNumber);
}

async function executeDeleteAdmin(sock, jid, senderNumber, targetNumber) {
  if (isOwner(targetNumber)) {
    await sock.sendMessage(jid, {
      text: `⛔ *TIDAK BISA MENGHAPUS OWNER*\n\n👑 Nomor *${targetNumber}* adalah Owner bot.\nOwner tidak bisa dihapus oleh siapapun.`,
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
  await sock.sendMessage(jid, {
    text: `🗑️ *ADMIN DIHAPUS*\n\n📱 Nomor: ${targetNumber}\n👤 Dihapus oleh: ${senderNumber}\n📊 Sisa admin: ${admins.length}`,
  });
}

async function sendAdminList(sock, jid) {
  const admins = loadAdmins();
  let text = `╔══════════════════════╗\n║  🔐 *DAFTAR ADMIN*   ║\n╚══════════════════════╝\n\n👑 *OWNER:*\n└ 📱 ${config.ownerNumber}\n\n🛡️ *ADMIN (${admins.length}):*\n`;
  if (admins.length === 0) text += `└ _Belum ada admin_\n`;
  else
    admins.forEach((admin, index) => {
      text += `${index === admins.length - 1 ? "└" : "├"} 📱 ${admin}\n`;
    });
  text += `\n📊 *Total:* ${admins.length + 1} (termasuk owner)`;
  await sock.sendMessage(jid, { text });
}

async function sendAdminDeleteList(sock, jid, senderNumber) {
  const admins = loadAdmins();
  const deletableAdmins = admins.filter((admin) => !isOwner(admin));
  if (deletableAdmins.length === 0) {
    await sock.sendMessage(jid, {
      text: "📋 *DELETE ADMIN*\n\n_Belum ada admin yang terdaftar._\n\nTambah admin dulu dengan:\n```/addadmin 628xxxxxxxxxx```",
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
    text: `🗑️ *DELETE ADMIN*\n\nPilih admin yang ingin dihapus.\nTotal admin: *${deletableAdmins.length}*\n\n👑 _Owner (${config.ownerNumber}) tidak bisa dihapus._`,
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
    } catch (e) {}
  }
  return "";
}

function checkBotMentioned(msg, botNumber) {
  const m = msg.message;
  if (!m) return false;
  const mentionedJids = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
  for (const mentioned of mentionedJids)
    if (mentioned.startsWith(botNumber)) return true;
  let text = "";
  if (m.conversation) text = m.conversation;
  if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
  return text.includes(`@${botNumber}`);
}

// ==========================================
// MENU UTAMA - INTERACTIVE LIST
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
      title: "🌐 Jasa Website",
      rows: [
        {
          header: "💻 Website",
          title: "Pesan Jasa Website",
          description: "Lihat paket pembuatan website",
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
    text: `╔══════════════════════╗\n║  🤖 *MENU BOT WA*   ║\n╚══════════════════════╝\n\nHalo *${sender}*! 👋\n${roleText}\n\n⏰ *Waktu:* ${new Date().toLocaleString("id-ID")}\n\nSilakan pilih menu dari daftar di bawah 👇`,
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
// HANDLER UTAMA
// ==========================================
async function handleMessage(sock, msg) {
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  const sender = msg.pushName || "Unknown";
  const botNumber = sock.user?.id?.replace(/:.*@/, "@")?.split("@")[0] || "";
  const senderNumber = getNumberFromJid(
    msg.key.participant || msg.key.remoteJid,
  );
  let rawText = extractText(msg);
  let text = rawText.toLowerCase().trim();

  const isBotMentioned = checkBotMentioned(msg, botNumber);
  console.log(
    `📩 Pesan dari ${sender} (${senderNumber}): ${text || "[non-text]"}`,
  );
  if (!text) return;

  // ========== PARAMETERIZED COMMANDS ==========
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

  // ========== CEK USER STATE (flow pemesanan website) ==========
  const userState = getUserState(senderNumber);
  if (userState && userState.step) {
    if (userState.step === "ask_name") {
      await handleNameInput(sock, jid, senderNumber, rawText);
      return;
    }
    if (userState.step === "ask_email") {
      await handleEmailAndPayment(sock, jid, senderNumber, rawText);
      return;
    }
  }

  // ========== HANDLE RESPONSE DARI INTERACTIVE LIST (pilihan paket) ==========
  if (text.startsWith("pkg_")) {
    await handlePackageSelection(sock, jid, senderNumber, text);
    return;
  }

  // ========== HANDLE RESPONSE BUTTON KONFIRMASI ==========
  if (text.startsWith("confirm_") || text === "cancel_order") {
    await handleOrderConfirmation(sock, jid, senderNumber, text);
    return;
  }

  // ========== ROUTING COMMAND ==========
  try {
    switch (text) {
      case "menu":
      case "/menu":
      case "help":
      case "/help":
        await sendMainMenu(sock, jid, sender, senderNumber);
        break;
      case "website":
      case "/website":
      case "jasa website":
        await sendWebsiteMenuWithButton(sock, jid, sender);
        break;
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
          text: `📌 *INFO BOT*\n\nBot ini dibuat menggunakan atexovi-baileys.\n\n• *Nama:* ${config.botName}\n• *Version:* ${config.version}\n• *Library:* atexovi-baileys\n• *Runtime:* Node.js`,
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
          text: "👨‍💻 *CREATOR*\n\nBot dibuat oleh Developer\nGitHub: https://github.com/iamrnldo",
        });
        break;
      case "admin_add":
        if (!isAdminOrOwner(senderNumber)) {
          await sock.sendMessage(jid, {
            text: "⛔ *AKSES DITOLAK*\n\nHanya Admin & Owner yang bisa mengakses menu ini.",
          });
          break;
        }
        await sock.sendMessage(jid, {
          text: "➕ *ADD ADMIN*\n\nGunakan salah satu cara berikut:\n\n📝 *Cara 1:* Ketik nomor\n```/addadmin 628xxxxxxxxxx```\n\n📝 *Cara 2:* Tag user (di grup)\n```/addadmin @user```\n\n⚠️ Format nomor: 628xxxxx (tanpa +)",
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
      case "btn_info":
        await sock.sendMessage(jid, {
          text: "📌 *INFO BOT*\n\nBot ini dibuat menggunakan atexovi-baileys.\nBot mendukung button, list, dan template message!",
        });
        break;
      case "btn_creator":
        await sock.sendMessage(jid, {
          text: "👨‍💻 *CREATOR*\n\nBot dibuat oleh Developer\nGitHub: https://github.com/iamrnldo",
        });
        break;
      case "btn_ping":
        const start = Date.now();
        await sock.sendMessage(jid, {
          text: `🏓 Pong!\nSpeed: ${Date.now() - start}ms`,
        });
        break;
      case "list_games":
        await sock.sendMessage(jid, {
          text: "🎮 *FITUR GAMES*\n\n• Tebak Gambar\n• Tebak Kata\n• Quiz\n\n_Coming Soon!_",
        });
        break;
      case "list_tools":
        await sock.sendMessage(jid, {
          text: "🔧 *FITUR TOOLS*\n\n• Sticker Maker\n• Image to PDF\n• QR Generator\n\n_Coming Soon!_",
        });
        break;
      case "list_downloader":
        await sock.sendMessage(jid, {
          text: "📥 *FITUR DOWNLOADER*\n\n• YouTube Downloader\n• Instagram Downloader\n• TikTok Downloader\n\n_Coming Soon!_",
        });
        break;
      case "list_info":
        await sock.sendMessage(jid, {
          text: `📋 *INFO*\n\nBot Version: ${config.version}\nLibrary: atexovi-baileys\nRuntime: Node.js`,
        });
        break;
      default:
        if (isBotMentioned) {
          await sock.sendMessage(jid, {
            text: `👋 Halo *${sender}*!\n\nKetik *menu* untuk melihat daftar perintah.\n\nBot ini mendukung:\n• Interactive List Button\n• Button Message\n• List Message\n• Template Button\n• Jasa Pembuatan Website`,
          });
        }
        break;
    }
  } catch (error) {
    console.error("❗ Error handling message:", error);
  }
}

// ==========================================
// FUNGSI MESSAGE LAINNYA (Button, List, Template, Image)
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
    text: "🔘 *BUTTON MESSAGE*\n\nIni adalah contoh Button Message.\nSilakan tekan salah satu tombol di bawah!",
    footer: "Pilih salah satu button 👇",
    buttons,
    headerType: 1,
  });
}

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
    text: "📋 *LIST MESSAGE*\n\nIni adalah contoh List Message.\nTekan tombol di bawah untuk melihat daftar fitur!",
    footer: "© 2024 Bot WhatsApp",
    title: "Menu List",
    buttonText: "📋 Lihat Daftar Menu",
    sections,
  });
}

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
    text: "📎 *TEMPLATE BUTTON*\n\nIni adalah contoh Template Button Message.\nAda 3 jenis button:\n\n• 🌐 URL Button (buka link)\n• 📞 Call Button (telepon)\n• 🔄 Quick Reply Button",
    footer: "© 2024 Bot WhatsApp",
    templateButtons,
  });
}

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

module.exports = { handleMessage };
