// ==========================================
// SESSION_MANAGER.JS - Supabase PostgreSQL
// ==========================================

require("dotenv").config();

const fs = require("fs");
const path = require("path");

// ==========================================
// PATHS
// ==========================================
const AUTH_DIR = (() => {
  const candidate = path.resolve(__dirname, "..", "session");
  // Cek apakah bisa ditulis
  try {
    const parentDir = path.dirname(candidate);
    fs.accessSync(parentDir, fs.constants.W_OK);
    return candidate;
  } catch {
    // Fallback ke dalam __dirname
    return path.resolve(__dirname, "session_data");
  }
})();

const DATABASE_URL = process.env.DATABASE_URL; // Supabase connection string
const SESSION_ID = process.env.SESSION_ID || "whatsapp_bot_session";

let pgClient = null;
let isConnected = false;
let backupTimeout = null;

function log(msg) {
  console.log(`[SessionManager] ${msg}`);
}

// ==========================================
// ENSURE DIR
// ==========================================
function ensureSessionDir() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      log(`📁 Folder session dibuat: ${AUTH_DIR}`);
    }
  } catch (e) {
    log(`❌ Tidak bisa buat folder: ${e.message}`);
  }
}

// ==========================================
// CEK SESSION VALID
// ==========================================
function isSessionValid() {
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(credsPath)) {
    log(`ℹ️ creds.json tidak ada: ${credsPath}`);
    return false;
  }

  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
    const valid = !!(creds.me || creds.noiseKey || creds.signedIdentityKey);
    log(valid ? `✅ Session valid` : `⚠️ Session tidak valid`);
    return valid;
  } catch (e) {
    log(`❌ Baca creds.json error: ${e.message}`);
    return false;
  }
}

// ==========================================
// CONNECT POSTGRESQL (Supabase)
// ==========================================
async function connectDB() {
  if (isConnected && pgClient) {
    try {
      await pgClient.query("SELECT 1");
      return true;
    } catch {
      isConnected = false;
      pgClient = null;
    }
  }

  if (!DATABASE_URL) {
    log("⚠️ DATABASE_URL tidak diset di environment.");
    return false;
  }

  try {
    const { Client } = require("pg");

    pgClient = new Client({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Supabase perlu ini
      },
      connectionTimeoutMillis: 15000,
      statement_timeout: 30000,
    });

    await pgClient.connect();

    // Buat tabel jika belum ada
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        files JSONB NOT NULL DEFAULT '{}',
        file_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        node_version VARCHAR(50)
      )
    `);

    isConnected = true;
    log("✅ Supabase PostgreSQL terhubung!");
    return true;
  } catch (e) {
    log(`❌ Database error: ${e.message}`);
    isConnected = false;
    pgClient = null;
    return false;
  }
}

// ==========================================
// BACKUP SESSION KE SUPABASE
// ==========================================
async function backupSession() {
  const ok = await connectDB();
  if (!ok) {
    log("⚠️ Skip backup — Database tidak terhubung.");
    return;
  }

  ensureSessionDir();

  const files = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
  if (files.length === 0) {
    log("⚠️ Session kosong, skip backup.");
    return;
  }

  try {
    const sessionData = {};

    for (const file of files) {
      const filePath = path.join(AUTH_DIR, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        sessionData[file] = JSON.parse(content);
      } catch {
        const buffer = fs.readFileSync(filePath);
        sessionData[file] = { _base64: buffer.toString("base64") };
      }
    }

    await pgClient.query(
      `INSERT INTO whatsapp_sessions (session_id, files, file_count, updated_at, node_version)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (session_id)
       DO UPDATE SET
         files = $2,
         file_count = $3,
         updated_at = NOW(),
         node_version = $4`,
      [SESSION_ID, JSON.stringify(sessionData), files.length, process.version],
    );

    log(`✅ Backup berhasil! (${files.length} files → Supabase)`);
  } catch (e) {
    log(`❌ Backup error: ${e.message}`);
    isConnected = false;
  }
}

// ==========================================
// RESTORE SESSION DARI SUPABASE
// ==========================================
async function restoreSession() {
  log("🔄 Mencoba restore session dari Supabase...");
  log(`   SESSION_ID: ${SESSION_ID}`);
  log(`   AUTH_DIR  : ${AUTH_DIR}`);

  const ok = await connectDB();
  if (!ok) {
    log("❌ Database tidak terhubung, skip restore.");
    return false;
  }

  if (isSessionValid()) {
    log("✅ Session lokal sudah valid, skip restore.");
    return true;
  }

  try {
    const result = await pgClient.query(
      "SELECT * FROM whatsapp_sessions WHERE session_id = $1",
      [SESSION_ID],
    );

    if (result.rows.length === 0 || !result.rows[0].files) {
      log("ℹ️ Tidak ada session di Supabase.");
      log("   Bot akan tampilkan QR Code untuk scan pertama.");
      return false;
    }

    const doc = result.rows[0];
    const files = doc.files;
    const total = Object.keys(files).length;

    ensureSessionDir();

    log(`📦 Ditemukan ${total} files di Supabase, menginstall...`);

    let restored = 0;
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(AUTH_DIR, filename);
      try {
        if (content && content._base64) {
          fs.writeFileSync(filePath, Buffer.from(content._base64, "base64"));
        } else {
          fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        }
        restored++;
      } catch (e) {
        log(`⚠️ Gagal restore ${filename}: ${e.message}`);
      }
    }

    log(`✅ Restore selesai! (${restored}/${total} files)`);
    if (doc.updated_at) {
      log(
        `   Last backup: ${new Date(doc.updated_at).toLocaleString("id-ID")}`,
      );
    }

    return isSessionValid();
  } catch (e) {
    log(`❌ Restore error: ${e.message}`);
    isConnected = false;
    return false;
  }
}

// ==========================================
// SCHEDULE BACKUP
// ==========================================
function scheduleBackup(delayMs = 5000) {
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    backupSession().catch((e) => log(`⚠️ scheduleBackup error: ${e.message}`));
  }, delayMs);
}

// ==========================================
// DELETE SESSION
// ==========================================
async function deleteSession() {
  const ok = await connectDB();
  if (!ok) return;

  try {
    await pgClient.query(
      "DELETE FROM whatsapp_sessions WHERE session_id = $1",
      [SESSION_ID],
    );
    log("🗑️ Session dihapus dari Supabase.");
  } catch (e) {
    log(`❌ Delete error: ${e.message}`);
  }
}

// ==========================================
// INIT
// ==========================================
async function initSessionManager() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔐 SESSION MANAGER (Supabase)      ║");
  console.log("╚══════════════════════════════════════╝");

  log(`__dirname  : ${__dirname}`);
  log(`AUTH_DIR   : ${AUTH_DIR}`);
  log(`SESSION_ID : ${SESSION_ID}`);
  log(`Node.js    : ${process.version}`);
  log(`Database   : ${DATABASE_URL ? "✅ URL diset" : "❌ tidak diset"}`);

  ensureSessionDir();

  if (isSessionValid()) {
    log("✅ Session lokal valid.");
    scheduleBackup(15000);
    return true;
  }

  const restored = await restoreSession();
  return restored;
}

module.exports = {
  initSessionManager,
  scheduleBackup,
  backupSession,
  restoreSession,
  deleteSession,
  isSessionValid,
  AUTH_DIR,
};

//is fixed