// ==========================================
// SESSION_MANAGER.JS - MongoDB Atlas
// ==========================================

const fs = require("fs");
const path = require("path");

// ==========================================
// FIX PATH — Gunakan /workspace/session
// ==========================================
// Di Koyeb:
// __dirname  = /workspace/main branch/
// ROOT       = /workspace/
// session/   = /workspace/session/  ← BENAR
//
// JANGAN pakai ../session karena akan jadi /session (permission denied)

const WORKSPACE_DIR =
  process.env.WORKSPACE_DIR ||
  path.resolve(__dirname, "..") || // /workspace
  "/workspace";

// Pastikan tidak ke root filesystem
const AUTH_DIR = (() => {
  const candidate = path.resolve(__dirname, "..", "session");
  // Jika candidate = /session (root), fallback ke dalam workspace
  if (candidate === "/session" || candidate.startsWith("/session/")) {
    return path.resolve(__dirname, "session"); // /workspace/main branch/session
  }
  return candidate; // /workspace/session
})();

const MONGO_URI = process.env.MONGODB_URI;
const SESSION_ID = process.env.SESSION_ID || "whatsapp_bot_session";

let mongoClient = null;
let db = null;
let collection = null;
let isConnected = false;
let backupTimeout = null;

function log(msg) {
  console.log(`[SessionManager] ${msg}`);
}

// ==========================================
// ENSURE DIR — Dengan permission check
// ==========================================
function ensureSessionDir() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      log(`📁 Folder session dibuat: ${AUTH_DIR}`);
    }
  } catch (e) {
    log(`❌ Tidak bisa buat folder ${AUTH_DIR}: ${e.message}`);
    // Fallback ke folder sementara yang pasti bisa ditulis
    const fallback = path.resolve(__dirname, "session_data");
    log(`⚠️ Fallback ke: ${fallback}`);
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    // Override AUTH_DIR
    Object.defineProperty(module.exports, "AUTH_DIR", { value: fallback });
  }
}

// ==========================================
// CONNECT MONGODB
// ==========================================
async function connectMongo() {
  if (isConnected && db) return true;

  if (!MONGO_URI) {
    log("⚠️ MONGODB_URI tidak diset di environment.");
    return false;
  }

  try {
    const { MongoClient } = require("mongodb");
    mongoClient = new MongoClient(MONGO_URI, {
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
    });

    await mongoClient.connect();
    db = mongoClient.db("whatsapp_session");
    collection = db.collection("sessions");

    await collection.createIndex({ sessionId: 1 }, { unique: true });

    isConnected = true;
    log("✅ MongoDB Atlas terhubung!");
    return true;
  } catch (e) {
    log(`❌ MongoDB error: ${e.message}`);
    isConnected = false;
    return false;
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
// BACKUP SESSION KE MONGODB
// ==========================================
async function backupSession() {
  const ok = await connectMongo();
  if (!ok) {
    log("⚠️ Skip backup — MongoDB tidak terhubung.");
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

    await collection.updateOne(
      { sessionId: SESSION_ID },
      {
        $set: {
          sessionId: SESSION_ID,
          files: sessionData,
          fileCount: files.length,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    log(`✅ Backup berhasil! (${files.length} files → MongoDB)`);
  } catch (e) {
    log(`❌ Backup error: ${e.message}`);
  }
}

// ==========================================
// RESTORE SESSION DARI MONGODB
// ==========================================
async function restoreSession() {
  log("🔄 Mencoba restore session dari MongoDB...");

  const ok = await connectMongo();
  if (!ok) {
    log("❌ MongoDB tidak terhubung, skip restore.");
    return false;
  }

  if (isSessionValid()) {
    log("✅ Session lokal sudah valid, skip restore.");
    return true;
  }

  try {
    const doc = await collection.findOne({ sessionId: SESSION_ID });

    if (!doc || !doc.files) {
      log("ℹ️ Tidak ada session di MongoDB.");
      log("   Bot akan tampilkan QR Code untuk scan pertama.");
      return false;
    }

    ensureSessionDir();

    const files = doc.files;
    let restored = 0;
    const total = Object.keys(files).length;

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
    if (doc.updatedAt) {
      log(`   Last backup: ${new Date(doc.updatedAt).toLocaleString("id-ID")}`);
    }

    return isSessionValid();
  } catch (e) {
    log(`❌ Restore error: ${e.message}`);
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
  const ok = await connectMongo();
  if (!ok) return;

  try {
    await collection.deleteOne({ sessionId: SESSION_ID });
    log("🗑️ Session dihapus dari MongoDB.");
  } catch (e) {
    log(`❌ Delete error: ${e.message}`);
  }
}

// ==========================================
// INIT
// ==========================================
async function initSessionManager() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔐 SESSION MANAGER (MongoDB)       ║");
  console.log("╚══════════════════════════════════════╝");

  log(`__dirname : ${__dirname}`);
  log(`AUTH_DIR  : ${AUTH_DIR}`);
  log(`SESSION_ID: ${SESSION_ID}`);
  log(`MongoDB   : ${MONGO_URI ? "✅ URI diset" : "❌ tidak diset"}`);

  ensureSessionDir();

  if (isSessionValid()) {
    log("✅ Session lokal valid.");
    scheduleBackup(10000);
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
