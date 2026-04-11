// ecosystem.config.js
// Jalankan dengan: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "bot-wa",
      script: "index.js",
      // Restart jika crash, BUKAN jika exit normal
      autorestart: true,
      watch: false, // JANGAN watch — akan restart tiap file berubah
      max_memory_restart: "512M",
      // Env
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      // Log
      log_file: "./logs/combined.log",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      // Restart policy
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
