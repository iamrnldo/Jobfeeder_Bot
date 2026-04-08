// ==========================================
//  HANDLER_PEMESANAN.JS
//  Pemesanan & Pembayaran (Pakasir QRIS)
//  ✅ Support multi kategori: website & botwa
// ==========================================

const config = require("./config");
const pakasir = require("./pakasir");

// ==========================================
// HELPERS
// ==========================================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGroupChat(jid) {
  return jid.endsWith("@g.us");
}

function normalizeNumber(num) {
  return num.replace(/[^0-9]/g, "");
}

function numberToJid(number) {
  return `${normalizeNumber(number)}@s.whatsapp.net`;
}

function getServiceById(id) {
  return config.services.find((s) => s.id === id) || null;
}

function getServicesByCategory(category) {
  return config.services.filter((s) => s.category === category);
}

function getAddonById(id) {
  return config.addons.find((a) => a.id === id) || null;
}

function formatRupiahShort(amount) {
  if (amount >= 1000000) {
    return `Rp ${amount / 1000000}jt`;
  } else if (amount >= 1000) {
    return `Rp ${amount / 1000}rb`;
  }
  return `Rp ${amount}`;
}

// ==========================================
// 🏠 MENU PILIH KATEGORI JASA
// ✅ Tampil dulu kategori: Website atau Bot WA
// ==========================================
async function sendKategoriMenu(sock, jid, sender) {
  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🛒 *PILIH KATEGORI JASA* ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n\n` +
      `Silakan pilih kategori jasa yang kamu butuhkan:\n\n` +
      `💼 *Jasa Pembuatan Website*\n` +
      `└ Landing Page, Custom Web, Premium\n\n` +
      `🤖 *Jasa Pembuatan Bot WhatsApp*\n` +
      `└ Bot Button, Bot Text Command\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan di *private chat*\n\n` +
      `Pilih kategori di bawah 👇`,
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    buttons: [
      {
        buttonId: "kategori_website",
        buttonText: { displayText: "💼 Jasa Pembuatan Website" },
        type: 1,
      },
      {
        buttonId: "kategori_botwa",
        buttonText: { displayText: "🤖 Jasa Pembuatan Bot WA" },
        type: 1,
      },
    ],
    headerType: 1,
  });
}

// ==========================================
// 💼 MENU JASA WEBSITE
// ✅ Button Message
// ==========================================
async function sendServiceMenu(sock, jid, sender) {
  const hasTestingService = config.services.some((s) => s.id === "testing");

  const buttons = [];

  if (hasTestingService) {
    buttons.push({
      buttonId: "service_testing",
      buttonText: { displayText: "🧪 Testing — Rp 5" },
      type: 1,
    });
  }

  buttons.push(
    {
      buttonId: "service_landing",
      buttonText: { displayText: "🌐 Landing Page — Rp 1.400.000" },
      type: 1,
    },
    {
      buttonId: "service_custom",
      buttonText: { displayText: "⚙️ Custom Web — Rp 2.500.000" },
      type: 1,
    },
    {
      buttonId: "service_premium",
      buttonText: { displayText: "🚀 Premium Web — Rp 3.500.000" },
      type: 1,
    },
  );

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  💼 *JASA PEMBUATAN WEB*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Kami menyediakan jasa pembuatan website\n` +
      `profesional dengan 3 pilihan paket:\n\n` +
      `🌐 *Landing Page Starter* — Rp 1.400.000\n` +
      `⚙️ *Custom Dynamic Web* — Rp 2.500.000\n` +
      `🚀 *Full-Service Premium* — Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan di *private chat*\n\n` +
      `Pilih paket di bawah 👇`,
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    buttons,
    headerType: 1,
  });
}

// ==========================================
// 🤖 MENU JASA BOT WHATSAPP
// ✅ Button Message
// ==========================================
async function sendBotWaMenu(sock, jid, sender) {
  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🤖 *JASA BOT WHATSAPP*   ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Halo *${sender}*! 👋\n\n` +
      `Kami menyediakan jasa pembuatan Bot WA\n` +
      `profesional dengan 2 pilihan paket:\n\n` +
      `🤖 *Bot WA Custom Button*\n` +
      `├ Harga: *Rp 500.000*\n` +
      `├ Interactive button (atex-ovi baileys)\n` +
      `├ ✅ Free panel 1 bulan\n` +
      `└ Perpanjang Rp 25.000/bulan\n\n` +
      `💬 *Bot WA Text Command*\n` +
      `├ Harga: *Rp 250.000*\n` +
      `├ Perintah teks sederhana\n` +
      `├ ✅ Free panel 1 bulan\n` +
      `└ Perpanjang Rp 25.000/bulan\n\n` +
      `➕ *Tambahan Fitur:*\n` +
      `├ 💳 Fitur QRIS — Rp 100.000\n` +
      `└ 🎨 Generate Image — Rp 50.000\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan di *private chat*\n\n` +
      `Pilih paket di bawah 👇`,
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    buttons: [
      {
        buttonId: "service_bot_button",
        buttonText: { displayText: "🤖 Bot Button — Rp 500.000" },
        type: 1,
      },
      {
        buttonId: "service_bot_text",
        buttonText: { displayText: "💬 Bot Text — Rp 250.000" },
        type: 1,
      },
    ],
    headerType: 1,
  });
}

// ==========================================
// 💼 DETAIL SERVICE (website)
// ✅ Jika dari group → redirect ke private
// ==========================================
async function sendServiceDetail(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `👋 Halo *${sender}*!\n\n` +
        `🔒 Untuk keamanan & privasi, proses pemesanan\n` +
        `dilanjutkan di *private chat*.\n\n` +
        `📩 Silakan cek chat pribadi kamu! 👇`,
    });

    await sendServiceDetailPrivate(
      sock,
      privateJid,
      sender,
      senderNumber,
      serviceId,
    );
    return;
  }

  await sendServiceDetailPrivate(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 💼 DETAIL SERVICE — PRIVATE (website)
// ==========================================
async function sendServiceDetailPrivate(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
) {
  const service = getServiceById(serviceId);
  if (!service) return;

  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *PESANAN PENDING*\n\n` +
        `Kamu masih punya pesanan belum dibayar:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n` +
        `💰 Total: *${pakasir.formatRupiah(existingOrder.totalPayment)}*\n\n` +
        `Ketik */cek* untuk cek status pembayaran.\n` +
        `Atau ketik */batalkan* untuk batalkan pesanan.`,
    });
    return;
  }

  const featureList = service.features.join("\n");

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ${service.emoji} *DETAIL PAKET*         ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 *${service.name}*\n` +
      `💰 *Harga: ${service.priceFormatted}*\n\n` +
      `📝 *Deskripsi:*\n${service.description}\n\n` +
      `🎯 *Fitur:*\n${featureList}\n\n` +
      `💳 *Pembayaran:* QRIS\n` +
      `⏰ *Masa berlaku:* ${config.pakasir.expiredMinutes} menit\n\n` +
      `Tekan tombol di bawah untuk melanjutkan 👇`,
    title: service.name,
    footer: `© 2024 ${config.botName}`,
    interactiveButtons: [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: `✅ Bayar ${service.priceFormatted}`,
          id: `confirm_${serviceId}`,
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "❌ Batal",
          id: "batalkan_pesanan",
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "📋 Lihat Paket Lain",
          id: "menu_jasa",
        }),
      },
    ],
  });
}

// ==========================================
// 🤖 DETAIL BOT WA — PRIVATE
// ✅ Menampilkan opsi addon (QRIS, Image Gen)
// ==========================================
async function sendBotWaDetail(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // Redirect dari group ke private
  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `👋 Halo *${sender}*!\n\n` +
        `🔒 Untuk keamanan & privasi, proses pemesanan\n` +
        `dilanjutkan di *private chat*.\n\n` +
        `📩 Silakan cek chat pribadi kamu! 👇`,
    });

    await sendBotWaDetailPrivate(
      sock,
      privateJid,
      sender,
      senderNumber,
      serviceId,
    );
    return;
  }

  await sendBotWaDetailPrivate(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 🤖 DETAIL BOT WA — PRIVATE (inti)
// ==========================================
async function sendBotWaDetailPrivate(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
) {
  const service = getServiceById(serviceId);
  if (!service) return;

  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ *PESANAN PENDING*\n\n` +
        `Kamu masih punya pesanan belum dibayar:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n` +
        `💰 Total: *${pakasir.formatRupiah(existingOrder.totalPayment)}*\n\n` +
        `Ketik */cek* untuk cek status.`,
    });
    return;
  }

  const featureList = service.features.join("\n");

  // Daftar addon
  let addonText = "";
  if (service.addons && service.addons.length > 0) {
    addonText =
      `\n➕ *Tambahan Fitur (Opsional):*\n` +
      service.addons
        .map((a) => {
          const addon = getAddonById(a.id);
          return addon
            ? `${addon.emoji} ${addon.name} — ${addon.priceFormatted}`
            : "";
        })
        .filter(Boolean)
        .join("\n") +
      "\n";
  }

  // Panel info
  let panelText = "";
  if (service.panelInfo) {
    panelText =
      `\n🖥️ *Info Panel Hosting:*\n` +
      `├ Free: ${service.panelInfo.freeMonth} bulan pertama\n` +
      `└ Perpanjang: ${service.panelInfo.monthlyFeeFormatted}\n`;
  }

  await sock.sendMessage(jid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  ${service.emoji} *DETAIL PAKET*         ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 *${service.name}*\n` +
      `💰 *Harga: ${service.priceFormatted}*\n\n` +
      `📝 *Deskripsi:*\n${service.description}\n\n` +
      `🎯 *Fitur:*\n${featureList}\n` +
      addonText +
      panelText +
      `\n💳 *Pembayaran:* QRIS\n` +
      `⏰ *Masa berlaku:* ${config.pakasir.expiredMinutes} menit\n\n` +
      `Pilih paket di bawah 👇`,
    title: service.name,
    footer: `© 2024 ${config.botName}`,
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "📋 Pilih Paket",
          sections: [
            {
              title: `${service.emoji} Paket Dasar`,
              rows: [
                {
                  header: service.priceFormatted,
                  title: `${service.emoji} ${service.name} (Tanpa Addon)`,
                  description: `Hanya bot dasar — ${service.priceFormatted}`,
                  id: `confirm_${serviceId}_base`,
                },
              ],
            },
            {
              title: "➕ Paket + Addon",
              rows: [
                {
                  header: `${service.priceFormatted} + Rp 100.000`,
                  title: "💳 + Fitur Pembayaran QRIS",
                  description: `${service.name} + QRIS — ${pakasir.formatRupiah(service.price + 100000)}`,
                  id: `confirm_${serviceId}_qris`,
                },
                {
                  header: `${service.priceFormatted} + Rp 50.000`,
                  title: "🎨 + Fitur Generate Image",
                  description: `${service.name} + Image Gen — ${pakasir.formatRupiah(service.price + 50000)}`,
                  id: `confirm_${serviceId}_imggen`,
                },
                {
                  header: `${service.priceFormatted} + Rp 150.000`,
                  title: "💳🎨 + QRIS & Generate Image",
                  description: `${service.name} + Semua Addon — ${pakasir.formatRupiah(service.price + 150000)}`,
                  id: `confirm_${serviceId}_all`,
                },
              ],
            },
            {
              title: "❌ Batalkan",
              rows: [
                {
                  header: "Kembali",
                  title: "❌ Batal / Lihat Paket Lain",
                  description: "Kembali ke menu jasa Bot WA",
                  id: "menu_botwa",
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
// 💳 KONFIRMASI PEMBAYARAN
// ✅ Support serviceId dengan suffix addon
//    Format: confirm_{serviceId}_{addonType}
//    Contoh: confirm_bot_button_base
//            confirm_bot_button_qris
//            confirm_bot_button_all
// ==========================================
async function handleConfirmPayment(
  sock,
  jid,
  sender,
  senderNumber,
  fullServiceId,
) {
  // Parse serviceId dan addonType
  // fullServiceId contoh: "bot_button_qris" atau "landing"
  const { serviceId, addonType, finalPrice, addonLabel } =
    parseServiceId(fullServiceId);

  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // Redirect dari group ke private
  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `🔒 Proses pembayaran dilakukan di *private chat*.\n` +
        `Cek chat pribadi kamu! 👇`,
    });

    await processPayment(
      sock,
      privateJid,
      sender,
      senderNumber,
      serviceId,
      addonType,
      finalPrice,
      addonLabel,
    );
    return;
  }

  await processPayment(
    sock,
    jid,
    sender,
    senderNumber,
    serviceId,
    addonType,
    finalPrice,
    addonLabel,
  );
}

// ==========================================
// HELPER: Parse service ID + addon type
// ==========================================
function parseServiceId(fullServiceId) {
  // Cek apakah ada suffix addon
  const addonSuffixes = ["_base", "_qris", "_imggen", "_all"];

  let serviceId = fullServiceId;
  let addonType = "base";

  for (const suffix of addonSuffixes) {
    if (fullServiceId.endsWith(suffix)) {
      serviceId = fullServiceId.slice(0, -suffix.length);
      addonType = suffix.replace("_", "");
      break;
    }
  }

  const service = getServiceById(serviceId);
  if (!service) {
    return { serviceId, addonType, finalPrice: 0, addonLabel: "" };
  }

  let addonPrice = 0;
  let addonLabel = "";

  switch (addonType) {
    case "qris":
      addonPrice = 100000;
      addonLabel = " + Fitur QRIS";
      break;
    case "imggen":
      addonPrice = 50000;
      addonLabel = " + Generate Image";
      break;
    case "all":
      addonPrice = 150000;
      addonLabel = " + QRIS & Generate Image";
      break;
    default:
      addonPrice = 0;
      addonLabel = "";
  }

  return {
    serviceId,
    addonType,
    finalPrice: service.price + addonPrice,
    addonLabel,
  };
}

// ==========================================
// 💳 PROSES PEMBAYARAN — SELALU PRIVATE
// ==========================================
async function processPayment(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
  addonType = "base",
  finalPrice = null,
  addonLabel = "",
) {
  const service = getServiceById(serviceId);
  if (!service) return;

  const price = finalPrice || service.price;
  const serviceName = service.name + addonLabel;

  // Cek pending order
  const existingOrder = pakasir.getPendingOrderByBuyer(senderNumber);
  if (existingOrder) {
    await sock.sendMessage(jid, {
      text:
        `⚠️ Masih ada pesanan pending:\n\n` +
        `📦 Order: *${existingOrder.orderId}*\n` +
        `💼 Jasa: *${existingOrder.serviceName}*\n\n` +
        `Ketik */cek* untuk cek status.`,
    });
    return;
  }

  // Loading
  await sock.sendMessage(jid, {
    text:
      `⏳ *Membuat pembayaran QRIS...*\n\n` +
      `💼 ${serviceName}\n` +
      `💰 ${pakasir.formatRupiah(price)}\n\n` +
      `Mohon tunggu...`,
  });

  // Buat order
  const order = pakasir.createOrder({
    serviceId: service.id,
    serviceName: serviceName,
    amount: price,
    buyerJid: jid,
    buyerNumber: senderNumber,
    buyerName: sender,
  });

  // Panggil Pakasir API
  const result = await pakasir.createTransaction(order.orderId, price, "qris");

  if (result.success && result.payment) {
    const payment = result.payment;
    const totalPayment = payment.total_payment || price;
    const fee = payment.fee || 0;

    pakasir.updateOrder(order.orderId, {
      fee,
      totalPayment,
      paymentMethod: payment.payment_method || "qris",
      paymentNumber: payment.payment_number || null,
      expiredAt: payment.expired_at || order.expiredAt,
    });

    // Generate QR
    if (payment.payment_number && payment.payment_method === "qris") {
      const qrBuffer = await pakasir.generateQRImage(payment.payment_number);

      if (qrBuffer) {
        const sentMsg = await sock.sendMessage(jid, {
          image: qrBuffer,
          caption:
            `╔══════════════════════════╗\n` +
            `║  💳 *PEMBAYARAN QRIS*     ║\n` +
            `╚══════════════════════════╝\n\n` +
            `📦 *Order ID:* ${order.orderId}\n` +
            `💼 *Jasa:* ${serviceName}\n` +
            `💰 *Harga:* ${service.priceFormatted}\n` +
            (addonLabel
              ? `➕ *Addon:* ${addonLabel.replace(" + ", "")}\n`
              : ``) +
            (fee > 0
              ? `💸 *Biaya admin:* ${pakasir.formatRupiah(fee)}\n`
              : ``) +
            `💵 *Total bayar:* *${pakasir.formatRupiah(totalPayment)}*\n` +
            `👤 *Pemesan:* ${sender}\n\n` +
            `📱 *Cara Bayar:*\n` +
            `1. Buka e-wallet / m-banking\n` +
            `2. Pilih Scan QR / QRIS\n` +
            `3. Scan QR code di atas\n` +
            `4. Bayar sebesar *${pakasir.formatRupiah(totalPayment)}*\n\n` +
            `⏰ *Berlaku sampai:*\n` +
            `${pakasir.formatDate(payment.expired_at)}\n\n` +
            `📋 Ketik */cek* setelah bayar\n` +
            `🚫 Tekan tombol di bawah untuk batalkan`,
          interactiveButtons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "🚫 Batalkan Pesanan",
                id: "batalkan_pesanan",
              }),
            },
          ],
        });

        if (sentMsg?.key) {
          pakasir.updateOrder(order.orderId, {
            qrisMessageKey: sentMsg.key,
          });
          console.log(`💾 QRIS key saved: ${order.orderId}`);
        }
      } else {
        // Fallback link
        const payUrl = pakasir.getPaymentUrl(order.orderId, price, true);
        const sentMsg = await sock.sendMessage(jid, {
          text:
            `💳 *PEMBAYARAN QRIS*\n\n` +
            `📦 Order: *${order.orderId}*\n` +
            `💼 Jasa: *${serviceName}*\n` +
            `💵 Total: *${pakasir.formatRupiah(totalPayment)}*\n\n` +
            `🔗 *Link Pembayaran:*\n${payUrl}\n\n` +
            `⏰ Berlaku: ${pakasir.formatDate(payment.expired_at)}\n\n` +
            `📋 Ketik */cek* setelah bayar\n` +
            `🚫 Tekan tombol di bawah untuk batalkan`,
          interactiveButtons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "🚫 Batalkan Pesanan",
                id: "batalkan_pesanan",
              }),
            },
          ],
        });

        if (sentMsg?.key) {
          pakasir.updateOrder(order.orderId, { qrisMessageKey: sentMsg.key });
        }
      }
    } else {
      // Non-QRIS (VA)
      const sentMsg = await sock.sendMessage(jid, {
        text:
          `💳 *PEMBAYARAN*\n\n` +
          `📦 Order: *${order.orderId}*\n` +
          `💼 Jasa: *${serviceName}*\n` +
          `💵 Total: *${pakasir.formatRupiah(totalPayment)}*\n\n` +
          `🏦 *Metode:* ${(payment.payment_method || "").toUpperCase()}\n` +
          `🔢 *Nomor VA:* \`${payment.payment_number}\`\n\n` +
          `⏰ Berlaku: ${pakasir.formatDate(payment.expired_at)}\n\n` +
          `📋 Ketik */cek* setelah bayar\n` +
          `🚫 Tekan tombol di bawah untuk batalkan`,
        interactiveButtons: [
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "🚫 Batalkan Pesanan",
              id: "batalkan_pesanan",
            }),
          },
        ],
      });

      if (sentMsg?.key) {
        pakasir.updateOrder(order.orderId, { qrisMessageKey: sentMsg.key });
      }
    }

    // Notif owner
    await notifyOwnerNewOrder(
      sock,
      order,
      sender,
      senderNumber,
      {
        ...service,
        name: serviceName,
        price,
        priceFormatted: pakasir.formatRupiah(price),
      },
      result.payment,
    );

    console.log(`✅ Payment created: ${order.orderId} | ${senderNumber}`);
  } else {
    // GAGAL
    pakasir.updateOrder(order.orderId, { status: "failed" });

    const errorMsg = result.error || "Unknown error";
    const payUrl = pakasir.getPaymentUrl(order.orderId, price, true);

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMBUAT QRIS*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `❗ Error: ${errorMsg}\n\n` +
        `🔗 *Alternatif:*\n${payUrl}\n\n` +
        `Ketik */jasa* untuk memesan ulang.`,
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🔄 Coba Lagi",
            id: `confirm_${serviceId}`,
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Menu Utama",
            id: "menu",
          }),
        },
      ],
    });

    try {
      await sock.sendMessage(numberToJid(config.ownerNumber), {
        text:
          `⚠️ *PAYMENT ERROR*\n\n` +
          `📦 ${order.orderId}\n` +
          `💼 ${serviceName}\n` +
          `👤 ${sender} (${senderNumber})\n` +
          `❗ ${errorMsg}`,
      });
    } catch (e) {}

    console.error(`❌ Payment failed: ${order.orderId} | ${errorMsg}`);
  }
}

// ==========================================
// 🚫 HANDLE CANCEL ORDER
// ==========================================
async function handleCancelOrder(sock, jid, senderNumber) {
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `🚫 Pembatalan diproses di *private chat* kamu.`,
    });
  }

  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (!order) {
    await sock.sendMessage(targetJid, {
      text:
        `🚫 *TIDAK ADA PESANAN AKTIF*\n\n` +
        `Tidak ditemukan pesanan yang sedang pending.\n\n` +
        `Ketik *menu* untuk kembali.`,
    });
    return;
  }

  console.log(`🚫 Cancelling order: ${order.orderId} by ${senderNumber}`);

  // Cancel di Pakasir
  await pakasir.cancelTransaction(order.orderId, order.amount);

  // Update DB
  pakasir.updateOrder(order.orderId, { status: "cancelled" });

  // Delete pesan QRIS
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS deleted on cancel: ${order.orderId}`);
    } catch (e) {
      console.error(`❌ Gagal delete QRIS:`, e.message);
    }
    await delay(800);
  }

  // Konfirmasi ke buyer
  await sock.sendMessage(targetJid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🚫 *PESANAN DIBATALKAN*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `Pesanan kamu telah berhasil dibatalkan.\n\n` +
      `📦 *Order:* ${order.orderId}\n` +
      `💼 *Jasa:* ${order.serviceName}\n` +
      `💰 *Total:* ${pakasir.formatRupiah(order.totalPayment)}\n` +
      `🚫 *Status:* Dibatalkan\n` +
      `📅 *Waktu:* ${new Date().toLocaleString("id-ID")}\n\n` +
      `Jika ingin memesan kembali, ketik */jasa*`,
    interactiveButtons: [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🛍️ Pesan Lagi",
          id: "menu_jasa",
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🏠 Menu Utama",
          id: "menu",
        }),
      },
    ],
  });

  // Notif owner
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `🚫 *PESANAN DIBATALKAN*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `💼 Jasa: ${order.serviceName}\n` +
        `💰 Total: ${pakasir.formatRupiah(order.totalPayment)}\n\n` +
        `👤 *Dibatalkan oleh:*\n` +
        `├ Nama: ${order.buyerName}\n` +
        `└ HP: ${order.buyerNumber}\n\n` +
        `📅 Waktu: ${new Date().toLocaleString("id-ID")}`,
    });
  } catch (e) {}

  console.log(`✅ Order cancelled: ${order.orderId}`);
}

// ==========================================
// 🔍 CEK PEMBAYARAN
// ==========================================
async function handleCheckPayment(sock, jid, senderNumber) {
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `🔍 Status pembayaran dikirim ke *private chat* kamu!`,
    });
  }

  const order = pakasir.getPendingOrderByBuyer(senderNumber);

  if (!order) {
    const orders = pakasir.loadOrders();
    const lastOrder = orders
      .filter((o) => o.buyerNumber === senderNumber)
      .pop();

    if (lastOrder) {
      await sock.sendMessage(targetJid, {
        text:
          `📋 *PESANAN TERAKHIR*\n\n` +
          `📦 Order: *${lastOrder.orderId}*\n` +
          `💼 Jasa: *${lastOrder.serviceName}*\n` +
          `💰 Total: *${pakasir.formatRupiah(lastOrder.totalPayment)}*\n` +
          `${pakasir.statusEmoji(lastOrder.status)} Status: *${pakasir.statusLabel(lastOrder.status)}*\n` +
          (lastOrder.completedAt
            ? `\n✅ Dibayar: ${pakasir.formatDate(lastOrder.completedAt)}`
            : ``) +
          `\n\nKetik */jasa* untuk pesanan baru.`,
      });
    } else {
      await sock.sendMessage(targetJid, {
        text: `📋 Belum ada pesanan.\nKetik */jasa* untuk melihat layanan.`,
      });
    }
    return;
  }

  // Cek expired
  if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
    pakasir.updateOrder(order.orderId, { status: "expired" });

    if (order.qrisMessageKey) {
      try {
        await sock.sendMessage(order.buyerJid, {
          delete: order.qrisMessageKey,
        });
      } catch (e) {}
    }

    await sock.sendMessage(targetJid, {
      text:
        `⏰ *PEMBAYARAN EXPIRED*\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n\n` +
        `QRIS sudah tidak berlaku.\n` +
        `Ketik */jasa* untuk pesan baru.`,
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🔄 Pesan Ulang",
            id: "menu_jasa",
          }),
        },
      ],
    });
    return;
  }

  // Cek via Pakasir API
  const detail = await pakasir.getTransactionDetail(
    order.orderId,
    order.amount,
  );

  if (detail.success && detail.transaction) {
    const status = (detail.transaction.status || "").toLowerCase();

    if (status === "completed") {
      pakasir.updateOrder(order.orderId, {
        status: "completed",
        completedAt:
          detail.transaction.completed_at || new Date().toISOString(),
      });

      await notifyPaymentSuccess(sock, pakasir.findOrderById(order.orderId));
      return;
    }
  }

  // Masih pending
  const timeLeft = order.expiredAt
    ? Math.max(0, Math.ceil((new Date(order.expiredAt) - new Date()) / 60000))
    : "?";

  await sock.sendMessage(targetJid, {
    text:
      `╔══════════════════════════╗\n` +
      `║  🔍 *STATUS PEMBAYARAN*   ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📦 Order: *${order.orderId}*\n` +
      `💼 Jasa: *${order.serviceName}*\n` +
      `💵 Total: *${pakasir.formatRupiah(order.totalPayment)}*\n` +
      `⏳ Status: *Menunggu Pembayaran*\n` +
      `⏰ Sisa waktu: *${timeLeft} menit*\n\n` +
      `Segera scan QRIS untuk menyelesaikan pembayaran.\n` +
      `Ketik */cek* lagi setelah bayar.`,
    interactiveButtons: [
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🔄 Cek Ulang",
          id: "menu_cek_bayar",
        }),
      },
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🚫 Batalkan Pesanan",
          id: "batalkan_pesanan",
        }),
      },
    ],
  });
}

// ==========================================
// 📋 RIWAYAT ORDER (USER)
// ==========================================
async function handleOrderHistory(sock, jid, senderNumber) {
  const targetJid = isGroupChat(jid) ? numberToJid(senderNumber) : jid;

  if (isGroupChat(jid)) {
    await sock.sendMessage(jid, {
      text: `📋 Riwayat pesanan dikirim ke *private chat* kamu!`,
    });
  }

  const orders = pakasir
    .loadOrders()
    .filter((o) => o.buyerNumber === senderNumber)
    .slice(-10)
    .reverse();

  if (orders.length === 0) {
    await sock.sendMessage(targetJid, {
      text:
        `📋 *RIWAYAT PESANAN*\n\n` +
        `_Belum ada pesanan._\n\n` +
        `Ketik */jasa* untuk mulai memesan.`,
    });
    return;
  }

  let text = `📋 *RIWAYAT PESANAN*\n\n`;

  orders.forEach((o, i) => {
    text +=
      `*${i + 1}. ${o.serviceName}*\n` +
      `   📦 ${o.orderId}\n` +
      `   💰 ${pakasir.formatRupiah(o.totalPayment)}\n` +
      `   ${pakasir.statusEmoji(o.status)} ${pakasir.statusLabel(o.status)}\n` +
      `   📅 ${pakasir.formatDate(o.createdAt)}\n\n`;
  });

  text += `_Menampilkan ${orders.length} pesanan terakhir_`;

  await sock.sendMessage(targetJid, { text });
}

// ==========================================
// 🔔 NOTIF OWNER: PESANAN BARU
// ==========================================
async function notifyOwnerNewOrder(
  sock,
  order,
  buyerName,
  buyerNumber,
  service,
  payment,
) {
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `╔══════════════════════════╗\n` +
        `║  🆕 *PESANAN BARU!*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${service.name}*\n` +
        `💰 Harga: *${service.priceFormatted}*\n` +
        (payment?.fee ? `💸 Fee: ${pakasir.formatRupiah(payment.fee)}\n` : ``) +
        `💵 Total: *${pakasir.formatRupiah(payment?.total_payment || service.price)}*\n\n` +
        `👤 *Pemesan:*\n` +
        `├ Nama: ${buyerName}\n` +
        `└ HP: ${buyerNumber}\n\n` +
        `⏳ Status: Menunggu Pembayaran\n` +
        `⏰ Expired: ${pakasir.formatDate(payment?.expired_at || order.expiredAt)}`,
    });
  } catch (err) {
    console.error("❌ Gagal notif owner (new order):", err.message);
  }
}

// ==========================================
// ✅ NOTIF PEMBAYARAN BERHASIL
// ==========================================
async function notifyPaymentSuccess(sock, order) {
  if (!order) return;

  console.log(`\n🎉 PAYMENT SUCCESS: ${order.orderId}`);

  // STEP 1: Delete QRIS
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS deleted: ${order.orderId}`);
    } catch (err) {
      console.error(`❌ Gagal delete QRIS:`, err.message);
    }
    await delay(1500);
  }

  // STEP 2: Notif buyer
  try {
    await sock.sendMessage(order.buyerJid, {
      text:
        `╔══════════════════════════╗\n` +
        `║  ✅ *PEMBAYARAN BERHASIL!* ║\n` +
        `╚══════════════════════════╝\n\n` +
        `Terima kasih! 🎉\n\n` +
        `📦 *Order:* ${order.orderId}\n` +
        `💼 *Jasa:* ${order.serviceName}\n` +
        `💰 *Total:* *${pakasir.formatRupiah(order.totalPayment)}*\n` +
        `✅ *Status:* Lunas\n` +
        `📅 *Dibayar:* ${pakasir.formatDate(order.completedAt)}\n\n` +
        `📌 *Langkah selanjutnya:*\n` +
        `Tim kami akan segera menghubungi Anda\n` +
        `untuk memulai pengerjaan.\n\n` +
        `Terima kasih telah mempercayakan\n` +
        `project Anda kepada kami! 🙏`,
    });

    pakasir.updateOrder(order.orderId, { notifiedBuyer: true });
    console.log(`✅ Buyer notified: ${order.buyerNumber}`);
  } catch (err) {
    console.error("❌ Gagal notif buyer:", err.message);
  }

  // STEP 3: Notif owner
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `╔══════════════════════════╗\n` +
        `║  💰 *PEMBAYARAN MASUK!*   ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n` +
        `💰 Jumlah: *${pakasir.formatRupiah(order.totalPayment)}*\n\n` +
        `👤 *Dari:*\n` +
        `├ Nama: ${order.buyerName}\n` +
        `└ HP: ${order.buyerNumber}\n\n` +
        `✅ Status: Lunas\n` +
        `📅 Waktu: ${pakasir.formatDate(order.completedAt)}\n\n` +
        `💡 Segera hubungi client untuk mulai pengerjaan.`,
    });

    pakasir.updateOrder(order.orderId, { notifiedSeller: true });
    console.log(`✅ Owner notified`);
  } catch (err) {
    console.error("❌ Gagal notif owner:", err.message);
  }

  console.log(`✅ Payment SUCCESS done: ${order.orderId}`);
}

// ==========================================
// ❌ NOTIF PEMBAYARAN GAGAL / EXPIRED
// ==========================================
async function notifyPaymentFailed(sock, order, reason = "expired") {
  if (!order) return;

  const reasonText =
    reason === "expired"
      ? "QRIS telah kedaluwarsa"
      : reason === "cancelled"
        ? "Pembayaran dibatalkan"
        : "Pembayaran gagal diproses";

  const emoji =
    reason === "expired" ? "⏰" : reason === "cancelled" ? "🚫" : "❌";

  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
    } catch (e) {}
    await delay(500);
  }

  try {
    await sock.sendMessage(order.buyerJid, {
      text:
        `${emoji} *PEMBAYARAN ${reason.toUpperCase()}*\n\n` +
        `📦 Order: *${order.orderId}*\n` +
        `💼 Jasa: *${order.serviceName}*\n` +
        `💰 Total: ${pakasir.formatRupiah(order.totalPayment)}\n\n` +
        `❗ ${reasonText}\n\n` +
        `Ketik */jasa* untuk pesan ulang.`,
      interactiveButtons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "🔄 Pesan Ulang",
            id: "menu_jasa",
          }),
        },
      ],
    });
  } catch (e) {}

  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text:
        `${emoji} *PEMBAYARAN ${reason.toUpperCase()}*\n\n` +
        `📦 ${order.orderId}\n` +
        `💼 ${order.serviceName}\n` +
        `👤 ${order.buyerName} (${order.buyerNumber})\n` +
        `❗ ${reasonText}`,
    });
  } catch (e) {}

  console.log(`${emoji} Payment ${reason}: ${order.orderId}`);
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  // Menu
  sendKategoriMenu,
  sendServiceMenu,
  sendBotWaMenu,

  // Detail
  sendServiceDetail,
  sendBotWaDetail,

  // Payment
  handleConfirmPayment,
  handleCancelOrder,
  handleCheckPayment,
  handleOrderHistory,

  // Notif
  notifyPaymentSuccess,
  notifyPaymentFailed,

  // Utils
  numberToJid,
  parseServiceId,
};
