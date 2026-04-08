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
    {
      id: "landing",
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
    },
    {
      id: "custom",
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
    },
    {
      id: "premium",
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
    },
  ],
};
