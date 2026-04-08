// ==========================================
//  HANDLER_PEMESANAN.JS
//  Pemesanan & Pembayaran (Pakasir QRIS)
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

// ==========================================
// 💼 MENU JASA WEBSITE
// ✅ Button Message (bukan list)
// ==========================================
async function sendServiceMenu(sock, jid, sender) {
  const hasTestingService = config.services.some((s) => s.id === "testing");

  const buttons = [];

  // Tombol testing (jika ada)
  if (hasTestingService) {
    buttons.push({
      buttonId: "service_testing",
      buttonText: { displayText: "🧪 Testing — Rp 5" },
      type: 1,
    });
  }

  // 3 tombol paket utama
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
      `Halo *${sender}*! 👋\n\n` +
      `Kami menyediakan jasa pembuatan website\n` +
      `profesional dengan 3 pilihan paket:\n\n` +
      `🌐 *Landing Page Starter*\n` +
      `└ Rp 1.400.000\n\n` +
      `⚙️ *Custom Dynamic Web*\n` +
      `└ Rp 2.500.000\n\n` +
      `🚀 *Full-Service Premium Web*\n` +
      `└ Rp 3.500.000\n\n` +
      `💳 Pembayaran via *QRIS*\n` +
      `🔒 Pemesanan di *private chat*\n\n` +
      `Pilih paket di bawah 👇`,
    footer: `© 2024 ${config.botName} | Pakasir QRIS`,
    buttons,
    headerType: 1,
  });
}

// ==========================================
// 💼 DETAIL SERVICE
// ✅ Jika dari group → redirect ke private
// ==========================================
async function sendServiceDetail(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // ✅ Jika dari GROUP → redirect ke private
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

  // Dari private → langsung tampilkan
  await sendServiceDetailPrivate(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 💼 DETAIL SERVICE — PRIVATE CHAT (inti)
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

  // Cek pending order
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
// 💳 KONFIRMASI PEMBAYARAN
// ✅ Selalu redirect ke private chat
// ==========================================
async function handleConfirmPayment(
  sock,
  jid,
  sender,
  senderNumber,
  serviceId,
) {
  const service = getServiceById(serviceId);
  if (!service) {
    await sock.sendMessage(jid, { text: "❌ Layanan tidak ditemukan." });
    return;
  }

  // ✅ Jika dari GROUP → redirect ke private
  if (isGroupChat(jid)) {
    const privateJid = numberToJid(senderNumber);

    await sock.sendMessage(jid, {
      text:
        `🔒 Proses pembayaran dilakukan di *private chat*.\n` +
        `Cek chat pribadi kamu! 👇`,
    });

    await processPayment(sock, privateJid, sender, senderNumber, serviceId);
    return;
  }

  // Dari private → langsung proses
  await processPayment(sock, jid, sender, senderNumber, serviceId);
}

// ==========================================
// 💳 PROSES PEMBAYARAN — SELALU PRIVATE
// ==========================================
async function processPayment(sock, jid, sender, senderNumber, serviceId) {
  const service = getServiceById(serviceId);
  if (!service) return;

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
      `💼 ${service.name}\n` +
      `💰 ${service.priceFormatted}\n\n` +
      `Mohon tunggu...`,
  });

  // Buat order di DB
  // ✅ buyerJid = private JID bukan group JID
  const order = pakasir.createOrder({
    serviceId: service.id,
    serviceName: service.name,
    amount: service.price,
    buyerJid: jid,
    buyerNumber: senderNumber,
    buyerName: sender,
  });

  // ==========================================
  // Panggil Pakasir API
  // POST /api/transactioncreate/qris
  // ==========================================
  const result = await pakasir.createTransaction(
    order.orderId,
    service.price,
    "qris",
  );

  if (result.success && result.payment) {
    const payment = result.payment;
    const totalPayment = payment.total_payment || service.price;
    const fee = payment.fee || 0;

    pakasir.updateOrder(order.orderId, {
      fee,
      totalPayment,
      paymentMethod: payment.payment_method || "qris",
      paymentNumber: payment.payment_number || null,
      expiredAt: payment.expired_at || order.expiredAt,
    });

    // ==========================================
    // QRIS → Generate gambar dari QR string
    // ==========================================
    if (payment.payment_number && payment.payment_method === "qris") {
      const qrBuffer = await pakasir.generateQRImage(payment.payment_number);

      if (qrBuffer) {
        // ✅ Kirim QR Image + Tombol Batalkan Pesanan
        const sentMsg = await sock.sendMessage(jid, {
          image: qrBuffer,
          caption:
            `╔══════════════════════════╗\n` +
            `║  💳 *PEMBAYARAN QRIS*     ║\n` +
            `╚══════════════════════════╝\n\n` +
            `📦 *Order ID:* ${order.orderId}\n` +
            `💼 *Jasa:* ${service.name}\n` +
            `💰 *Harga:* ${service.priceFormatted}\n` +
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
          // ✅ Tombol batalkan langsung di pesan QRIS
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
          console.log(
            `💾 QRIS message key saved: ${JSON.stringify(sentMsg.key)}`,
          );
        }
      } else {
        // Fallback: gagal generate gambar → kirim link + tombol batalkan
        const payUrl = pakasir.getPaymentUrl(
          order.orderId,
          service.price,
          true,
        );
        const sentMsg = await sock.sendMessage(jid, {
          text:
            `💳 *PEMBAYARAN QRIS*\n\n` +
            `📦 Order: *${order.orderId}*\n` +
            `💼 Jasa: *${service.name}*\n` +
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
          pakasir.updateOrder(order.orderId, {
            qrisMessageKey: sentMsg.key,
          });
        }
      }
    } else {
      // Non-QRIS (Virtual Account dll) + tombol batalkan
      const sentMsg = await sock.sendMessage(jid, {
        text:
          `╔══════════════════════════╗\n` +
          `║  💳 *PEMBAYARAN*          ║\n` +
          `╚══════════════════════════╝\n\n` +
          `📦 Order: *${order.orderId}*\n` +
          `💼 Jasa: *${service.name}*\n` +
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
        pakasir.updateOrder(order.orderId, {
          qrisMessageKey: sentMsg.key,
        });
      }
    }

    // Notif owner: ada order baru
    await notifyOwnerNewOrder(
      sock,
      order,
      sender,
      senderNumber,
      service,
      result.payment,
    );

    console.log(`✅ Payment created: ${order.orderId} | ${senderNumber}`);
  } else {
    // ❌ GAGAL
    pakasir.updateOrder(order.orderId, { status: "failed" });

    const errorMsg = result.error || "Unknown error";
    const payUrl = pakasir.getPaymentUrl(order.orderId, service.price, true);

    await sock.sendMessage(jid, {
      text:
        `❌ *GAGAL MEMBUAT QRIS*\n\n` +
        `📦 Order: ${order.orderId}\n` +
        `❗ Error: ${errorMsg}\n\n` +
        `🔗 *Alternatif — bayar via link:*\n${payUrl}\n\n` +
        `Atau coba lagi nanti.\n` +
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

    // Notif error ke owner
    try {
      await sock.sendMessage(numberToJid(config.ownerNumber), {
        text:
          `⚠️ *PAYMENT ERROR*\n\n` +
          `📦 ${order.orderId}\n` +
          `💼 ${service.name}\n` +
          `👤 ${sender} (${senderNumber})\n` +
          `❗ ${errorMsg}`,
      });
    } catch (e) {}

    console.error(`❌ Payment failed: ${order.orderId} | ${errorMsg}`);
  }
}

// ==========================================
// 🚫 HANDLE CANCEL ORDER
// ✅ Dipanggil dari tombol "Batalkan Pesanan"
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

  // STEP 1: Cancel di Pakasir API
  await pakasir.cancelTransaction(order.orderId, order.amount);

  // STEP 2: Update status di DB
  pakasir.updateOrder(order.orderId, { status: "cancelled" });

  // STEP 3: Delete pesan QRIS
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS message deleted on cancel: ${order.orderId}`);
    } catch (e) {
      console.error(`❌ Gagal delete QRIS on cancel:`, e.message);
    }
    await delay(800);
  }

  // STEP 4: Kirim konfirmasi ke buyer
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

  // STEP 5: Notif ke owner
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
  } catch (e) {
    console.error("❌ Gagal notif owner (cancel):", e.message);
  }

  console.log(`✅ Order cancelled: ${order.orderId}`);
}

// ==========================================
// 🔍 CEK PEMBAYARAN
// ✅ Jawab di private chat jika dari group
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

  // Cek expired lokal
  if (order.expiredAt && new Date(order.expiredAt) <= new Date()) {
    pakasir.updateOrder(order.orderId, { status: "expired" });

    // Delete pesan QRIS yang expired
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

  // ✅ Cek via Pakasir Transaction Detail API
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
// 1. Delete pesan QRIS
// 2. Notif buyer
// 3. Notif owner
// ==========================================
async function notifyPaymentSuccess(sock, order) {
  if (!order) return;

  console.log(`\n🎉 ═══════════════════════════════════════`);
  console.log(`🎉 PAYMENT SUCCESS: ${order.orderId}`);
  console.log(`🎉 Buyer: ${order.buyerName} (${order.buyerNumber})`);
  console.log(`🎉 ═══════════════════════════════════════\n`);

  // STEP 1: Delete pesan QRIS
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS message deleted: ${order.orderId}`);
    } catch (err) {
      console.error(`❌ Gagal delete QRIS:`, err.message);
    }
    await delay(1500);
  }

  // STEP 2: Notif sukses ke buyer (private)
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
        `untuk memulai pengerjaan project.\n\n` +
        `Terima kasih telah mempercayakan\n` +
        `project Anda kepada kami! 🙏`,
    });

    pakasir.updateOrder(order.orderId, { notifiedBuyer: true });
    console.log(`✅ Buyer notified: ${order.buyerNumber}`);
  } catch (err) {
    console.error("❌ Gagal notif buyer:", err.message);
  }

  // STEP 3: Notif ke owner (private)
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

  console.log(`✅ Payment SUCCESS flow done: ${order.orderId}`);
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

  // Delete pesan QRIS jika ada
  if (order.qrisMessageKey) {
    try {
      await sock.sendMessage(order.buyerJid, {
        delete: order.qrisMessageKey,
      });
      console.log(`🗑️ QRIS deleted (${reason}): ${order.orderId}`);
    } catch (e) {}
    await delay(500);
  }

  // Notif ke buyer (private)
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
  } catch (e) {
    console.error("❌ Gagal notif buyer (failed):", e.message);
  }

  // Notif ke owner
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
  sendServiceMenu,
  sendServiceDetail,
  handleConfirmPayment,
  handleCancelOrder,
  handleCheckPayment,
  handleOrderHistory,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  numberToJid,
};
