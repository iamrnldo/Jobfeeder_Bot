// ==========================================
// SESSION_MANAGER.JS - MongoDB Atlas
// ==========================================

const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.resolve(__dirname, "../session");
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
// ENSURE DIR
// ==========================================
function ensureSessionDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    log(`📁 Folder session dibuat: ${AUTH_DIR}`);
  }
}

// ==========================================
// CONNECT MONGODB
// ==========================================
async function connectMongo() {
  if (isConnected && db) return true;

  if (!MONGO_URI) {
    log("⚠️ MONGODB_URI tidak diset.");
    return false;
  }

  try {
    const { MongoClient } = require("mongodb");
    mongoClient = new MongoClient(MONGO_URI, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });

    await mongoClient.connect();
    db = mongoClient.db("whatsapp_session");
    collection = db.collection("sessions");

    // Buat index
    await collection.createIndex({ sessionId: 1 }, { unique: true });

    isConnected = true;
    log("✅ MongoDB Atlas terhubung!");
    return true;
  } catch (e) {
    log(`❌ MongoDB connection error: ${e.message}`);
    isConnected = false;
    return false;
  }
}

// ==========================================
// CEK SESSION VALID (lokal)
// ==========================================
function isSessionValid() {
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(credsPath)) return false;

  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
    return !!(creds.me || creds.noiseKey || creds.signedIdentityKey);
  } catch {
    return false;
  }
}

// ==========================================
// BACKUP SESSION KE MONGODB
// ==========================================
async function backupSession() {
  const ok = await connectMongo();
  if (!ok) return;

  ensureSessionDir();

  const files = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
  if (files.length === 0) {
    log("⚠️ Session kosong, skip backup.");
    return;
  }

  try {
    // Baca semua file session
    const sessionData = {};
    for (const file of files) {
      const filePath = path.join(AUTH_DIR, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        sessionData[file] = JSON.parse(content);
      } catch {
        // Simpan sebagai base64 jika bukan JSON
        const buffer = fs.readFileSync(filePath);
        sessionData[file] = { _base64: buffer.toString("base64") };
      }
    }

    // Simpan ke MongoDB
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

    log(`✅ Session di-backup ke MongoDB! (${files.length} files)`);
  } catch (e) {
    log(`❌ Backup error: ${e.message}`);
  }
}

// ==========================================
// RESTORE SESSION DARI MONGODB
// ==========================================
async function restoreSession() {
  log("\n🔄 Mencoba restore session dari MongoDB...");

  const ok = await connectMongo();
  if (!ok) {
    log("❌ MongoDB tidak terhubung.");
    return false;
  }

  // Jika session lokal sudah valid, skip
  if (isSessionValid()) {
    log("✅ Session lokal valid, skip restore.");
    return true;
  }

  try {
    const doc = await collection.findOne({ sessionId: SESSION_ID });

    if (!doc || !doc.files) {
      log("ℹ️ Tidak ada session di MongoDB.");
      log("   Bot akan tampilkan QR Code.");
      return false;
    }

    ensureSessionDir();

    // Restore semua file
    const files = doc.files;
    let restored = 0;

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(AUTH_DIR, filename);
      try {
        if (content._base64) {
          // File binary (base64)
          fs.writeFileSync(filePath, Buffer.from(content._base64, "base64"));
        } else {
          // File JSON
          fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        }
        restored++;
      } catch (e) {
        log(`⚠️ Gagal restore ${filename}: ${e.message}`);
      }
    }

    log(
      `✅ Session di-restore dari MongoDB! (${restored}/${Object.keys(files).length} files)`,
    );
    log(
      `   Last backup: ${doc.updatedAt?.toLocaleString("id-ID") || "unknown"}`,
    );

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
// DELETE SESSION DARI MONGODB
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
// INIT SESSION MANAGER
// ==========================================
async function initSessionManager() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔐 SESSION MANAGER (MongoDB)       ║");
  console.log("╚══════════════════════════════════════╝");

  log(`AUTH_DIR  : ${AUTH_DIR}`);
  log(`SESSION_ID: ${SESSION_ID}`);
  log(`MongoDB   : ${MONGO_URI ? "✅ URI diset" : "❌ tidak diset"}`);

  ensureSessionDir();

  // Cek session lokal dulu
  if (isSessionValid()) {
    log("✅ Session lokal valid.");
    // Tetap backup ke MongoDB untuk sinkronisasi
    scheduleBackup(10000);
    return true;
  }

  // Restore dari MongoDB
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
