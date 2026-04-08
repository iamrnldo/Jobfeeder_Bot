// ==========================================
//  CONFIG.JS - Konfigurasi Bot + Pakasir
// ==========================================

module.exports = {
  // ============ BOT ============
  ownerNumber: "6287719010818",
  botName: "Bot WhatsApp",
  version: "2.0.0",

  // ============ PAKASIR QRIS ============
  pakasir: {
    // ✅ FIX: Domain yang benar sesuai dokumentasi
    baseUrl: "https://app.pakasir.com",

    // Slug proyek (dari halaman proyek Pakasir)
    project: "jasapembuatanweb",

    // API Key (dari halaman detail proyek Pakasir)
    apiKey: "gIzN3WC5eWOnH7mZ38G7HzUVlIYB8sxs",

    // Metode pembayaran default
    // Pilihan: qris, bni_va, bri_va, cimb_niaga_va, permata_va, dll
    paymentMethod: "qris",

    // Webhook URL — ganti sesuai domain deploy kamu
    // Isi juga di halaman Edit Proyek di dashboard Pakasir
    webhookUrl:
      process.env.WEBHOOK_URL || "https://your-app.koyeb.app/webhook/pakasir",

    // Durasi QRIS berlaku (menit) — pakasir punya expired sendiri,
    // ini untuk tracking internal bot
    expiredMinutes: 30,
  },

  // ============ JASA WEBSITE ============
  services: [
  

    // ==========================================
    // 💼 JASA PEMBUATAN WEBSITE
    // ==========================================
    {
      id: "landing",
      category: "website",
      name: "Landing Page Starter",
      price: 1400000,
      priceFormatted: "Rp 1.400.000",
      emoji: "🌐",
      description: "Landing page profesional 1 halaman",
      features: [
        "✅ Desain responsif (mobile-friendly)",
        "✅ 1 halaman utama + section",
        "✅ Form kontak / WhatsApp link",
        "✅ Optimasi SEO dasar",
        "✅ Hosting gratis 1 tahun",
        "✅ Domain .com gratis 1 tahun",
        "✅ Revisi 2x",
        "✅ Pengerjaan 3-5 hari kerja",
      ],
      addons: [],
    },
    {
      id: "custom",
      category: "website",
      name: "Custom Dynamic Web",
      price: 2500000,
      priceFormatted: "Rp 2.500.000",
      emoji: "⚙️",
      description: "Website dinamis multi-halaman",
      features: [
        "✅ Desain responsif premium",
        "✅ Hingga 5 halaman",
        "✅ Panel admin (CMS)",
        "✅ Database terintegrasi",
        "✅ Form kontak + email notifikasi",
        "✅ Optimasi SEO lengkap",
        "✅ Hosting gratis 1 tahun",
        "✅ Domain .com gratis 1 tahun",
        "✅ Revisi 5x",
        "✅ Pengerjaan 7-14 hari kerja",
      ],
      addons: [],
    },
    {
      id: "premium",
      category: "website",
      name: "Full-Service Premium Web",
      price: 3500000,
      priceFormatted: "Rp 3.500.000",
      emoji: "🚀",
      description: "Website full-fitur untuk bisnis profesional",
      features: [
        "✅ Desain UI/UX custom premium",
        "✅ Unlimited halaman",
        "✅ Panel admin lengkap (CMS)",
        "✅ Database + API integration",
        "✅ Payment gateway (opsional)",
        "✅ Live chat widget",
        "✅ Analytics & tracking",
        "✅ SSL + keamanan premium",
        "✅ Hosting premium 1 tahun",
        "✅ Domain .com gratis 1 tahun",
        "✅ Maintenance 3 bulan gratis",
        "✅ Revisi unlimited",
        "✅ Pengerjaan 14-30 hari kerja",
      ],
      addons: [],
    },

    // ==========================================
    // 🤖 JASA PEMBUATAN BOT WHATSAPP
    // ==========================================
    {
      id: "bot_button",
      category: "botwa",
      name: "Bot WA Custom Button",
      price: 500000,
      priceFormatted: "Rp 500.000",
      emoji: "🤖",
      description: "Bot WhatsApp dengan interactive button (atex-ovi baileys)",
      features: [
        "✅ Bot WA interactive button",
        "✅ Library: atex-ovi baileys",
        "✅ Button Message, List, Template",
        "✅ Admin panel (add/del admin)",
        "✅ Custom command sesuai kebutuhan",
        "✅ Source code diberikan",
        "✅ Free panel hosting 1 bulan",
        "✅ Bulan berikutnya Rp 25.000/bulan",
        "✅ Support setup & deploy",
        "✅ Pengerjaan 3-5 hari kerja",
      ],
      addons: [
        { id: "addon_qris", name: "Fitur Pembayaran QRIS", price: 100000 },
        { id: "addon_imggen", name: "Fitur Generate Image", price: 50000 },
      ],
      panelInfo: {
        freeMonth: 1,
        monthlyFee: 25000,
        monthlyFeeFormatted: "Rp 25.000/bulan",
      },
    },
    {
      id: "bot_text",
      category: "botwa",
      name: "Bot WA Text Command",
      price: 250000,
      priceFormatted: "Rp 250.000",
      emoji: "💬",
      description: "Bot WhatsApp dengan perintah teks sederhana",
      features: [
        "✅ Bot WA text command",
        "✅ Command custom sesuai kebutuhan",
        "✅ Auto-reply pesan",
        "✅ Admin panel dasar",
        "✅ Source code diberikan",
        "✅ Free panel hosting 1 bulan",
        "✅ Bulan berikutnya Rp 25.000/bulan",
        "✅ Support setup & deploy",
        "✅ Pengerjaan 1-3 hari kerja",
      ],
      addons: [
        { id: "addon_qris", name: "Fitur Pembayaran QRIS", price: 100000 },
        { id: "addon_imggen", name: "Fitur Generate Image", price: 50000 },
      ],
      panelInfo: {
        freeMonth: 1,
        monthlyFee: 25000,
        monthlyFeeFormatted: "Rp 25.000/bulan",
      },
    },
  ],

  // ==========================================
  // ADD-ON FITUR BOT WA (referensi)
  // ==========================================
  addons: [
    {
      id: "addon_qris",
      name: "Fitur Pembayaran / Transaksi QRIS",
      price: 100000,
      priceFormatted: "Rp 100.000",
      emoji: "💳",
      description: "Integrasi pembayaran QRIS ke dalam bot WA",
      features: [
        "✅ Pembayaran via QRIS",
        "✅ Webhook otomatis",
        "✅ Notif buyer & seller",
        "✅ Manajemen order",
        "✅ Cek status pembayaran",
      ],
    },
    {
      id: "addon_imggen",
      name: "Fitur Generate Image",
      price: 50000,
      priceFormatted: "Rp 50.000",
      emoji: "🎨",
      description: "Generate gambar otomatis melalui bot WA",
      features: [
        "✅ Generate image dari teks",
        "✅ Template image custom",
        "✅ Kirim hasil via WA",
      ],
    },
  ],
};