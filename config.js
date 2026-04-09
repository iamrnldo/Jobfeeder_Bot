// ==========================================
//  CONFIG.JS - Konfigurasi Bot + Pakasir
// ==========================================

module.exports = {
  // ============ BOT ============
  ownerNumber: "6287719010818",
  botName: "JobFeeder",
  version: "2.0.0",

  // ============ PAKASIR QRIS ============
  pakasir: {
    baseUrl: "https://app.pakasir.com",
    project: "jasapembuatanweb",
    apiKey: "gIzN3WC5eWOnH7mZ38G7HzUVlIYB8sxs",
    paymentMethod: "qris",
    webhookUrl:
      process.env.WEBHOOK_URL ||
      "https://genuine-adria-iamrmldo-201524e5.koyeb.app/webhook/pakasir",
    expiredMinutes: 30,
  },

  // ==========================================
  // 🖥️ PANEL HOSTING OPTIONS
  // ==========================================
  panelOptions: [
    {
      id: "free",
      name: "Free Panel",
      price: 0,
      priceFormatted: "Gratis",
      specs: {
        cpu: "0.1 vCPU",
        ram: "256 MB RAM",
        disk: "2 GB Disk",
        region: "Washington",
        latency: "260ms",
      },
      emoji: "🆓",
      description: "Panel gratis dengan spesifikasi dasar",
    },
    {
      id: "enano",
      name: "eNano",
      price: 30000,
      priceFormatted: "Rp 30.000",
      specs: {
        cpu: "0.1 vCPU",
        ram: "256 MB RAM",
        disk: "2 GB Disk",
        region: "Singapore",
        latency: "60ms",
      },
      emoji: "🌱",
      description: "Panel entry level dengan server Singapore",
    },
    {
      id: "emicro",
      name: "eMicro",
      price: 50000,
      priceFormatted: "Rp 50.000",
      specs: {
        cpu: "0.25 vCPU",
        ram: "512 MB RAM",
        disk: "4 GB Disk",
        region: "Singapore",
        latency: "60ms",
      },
      emoji: "🚀",
      description: "Panel micro dengan performa lebih baik",
    },
    {
      id: "emedium",
      name: "eMedium",
      price: 200000,
      priceFormatted: "Rp 200.000",
      specs: {
        cpu: "1 vCPU",
        ram: "2 GB RAM",
        disk: "16 GB Disk",
        region: "Singapore",
        latency: "60ms",
      },
      emoji: "⚡",
      description: "Panel premium dengan spesifikasi tinggi",
    },
  ],

  // ==========================================
  // 💼 JASA WEBSITE
  // ==========================================
  services: [
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
        "✅ Support setup & deploy",
        "✅ Pengerjaan 3-5 hari kerja",
      ],
      addons: [
        { id: "addon_qris", name: "Fitur Pembayaran QRIS", price: 100000 },
        { id: "addon_imggen", name: "Fitur Generate Image", price: 50000 },
      ],
      requirePanel: true, // Bot butuh panel hosting
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
        "✅ Support setup & deploy",
        "✅ Pengerjaan 1-3 hari kerja",
      ],
      addons: [
        { id: "addon_qris", name: "Fitur Pembayaran QRIS", price: 100000 },
        { id: "addon_imggen", name: "Fitur Generate Image", price: 50000 },
      ],
      requirePanel: true, // Bot butuh panel hosting
    },
  ],

  // ==========================================
  // ADD-ON FITUR BOT WA
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
