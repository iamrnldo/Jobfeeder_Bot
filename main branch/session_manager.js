// ==========================================
// SESSION_MANAGER.JS
// Simpan & restore auth_session ke/dari
// folder session/ di repo yang sama
// ==========================================

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ==========================================
// PATHS
// ==========================================

// Lokasi auth_session yang dipakai bot
const AUTH_DIR = path.resolve(__dirname, "../session");

// Lokasi code bot (main branch/)
const ROOT_DIR = path.resolve(__dirname, "..");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "master";

let isConfigured = false;
let backupTimeout = null;

// ==========================================
// ENSURE SESSION DIR
// ==========================================
function ensureSessionDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`📁 Folder session dibuat: ${AUTH_DIR}`);
  }
}

// ==========================================
// SETUP GIT
// ==========================================
function setupGit() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.log("ℹ️  Session manager: GITHUB_TOKEN/GITHUB_REPO tidak diset.");
    console.log(
      "   Session hanya tersimpan lokal (akan hilang saat redeploy).",
    );
    return false;
  }

  try {
    execSync(`git config --global user.email "bot@session.com"`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });
    execSync(`git config --global user.name "Bot Session"`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });

    const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

    try {
      execSync(`git remote get-url origin`, {
        stdio: "pipe",
        cwd: ROOT_DIR,
      });
      execSync(`git remote set-url origin ${remoteUrl}`, {
        stdio: "pipe",
        cwd: ROOT_DIR,
      });
    } catch {
      execSync(`git remote add origin ${remoteUrl}`, {
        stdio: "pipe",
        cwd: ROOT_DIR,
      });
    }

    isConfigured = true;
    console.log(`✅ Session manager aktif → backup ke GitHub (${GITHUB_REPO})`);
    console.log(`   Branch : ${GITHUB_BRANCH}`);
    console.log(`   Folder : session/`);
    return true;
  } catch (e) {
    console.error(`❌ Setup git gagal: ${e.message}`);
    return false;
  }
}

// ==========================================
// CEK SESSION VALID
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
// BACKUP SESSION KE GITHUB
// ==========================================
async function backupSession() {
  if (!isConfigured) return;

  ensureSessionDir();

  const files = fs.readdirSync(AUTH_DIR);
  if (files.length === 0) {
    console.log("ℹ️  Session kosong, skip backup.");
    return;
  }

  try {
    console.log("💾 Backing up session ke GitHub...");

    // Add folder session/
    execSync(`git add session/ -f`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });

    // Cek ada perubahan
    let hasChanges = false;
    try {
      const status = execSync(`git status --porcelain session/`, {
        stdio: "pipe",
        cwd: ROOT_DIR,
      }).toString();
      hasChanges = !!status.trim();
    } catch {
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log("ℹ️  Session tidak berubah, skip backup.");
      return;
    }

    // Commit
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "session: backup ${timestamp}"`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });

    // Push
    execSync(`git push origin HEAD:${GITHUB_BRANCH} --force`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });

    console.log(
      `✅ Session berhasil di-backup ke GitHub branch '${GITHUB_BRANCH}'`,
    );
  } catch (e) {
    if (!e.message.includes("nothing to commit")) {
      console.warn(`⚠️ Backup session gagal: ${e.message}`);
    }
  }
}

// ==========================================
// SCHEDULE BACKUP (debounced 5 detik)
// ==========================================
function scheduleBackup(delayMs = 5000) {
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    backupSession().catch((e) =>
      console.warn(`⚠️ scheduleBackup error: ${e.message}`),
    );
  }, delayMs);
}

// ==========================================
// RESTORE SESSION DARI GITHUB
// ==========================================
async function restoreSession() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false;

  ensureSessionDir();

  // Jika session sudah valid, tidak perlu restore
  if (isSessionValid()) {
    console.log("✅ Session sudah ada dan valid, skip restore.");
    return true;
  }

  try {
    console.log(`🔄 Mencoba restore session dari GitHub...`);
    console.log(`   Repo  : ${GITHUB_REPO}`);
    console.log(`   Branch: ${GITHUB_BRANCH}`);
    console.log(`   Folder: session/`);

    const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

    // Fetch branch
    execSync(
      `git fetch ${remoteUrl} ${GITHUB_BRANCH}:refs/remotes/origin_session --depth=1`,
      {
        stdio: "pipe",
        cwd: ROOT_DIR,
      },
    );

    // Checkout folder session/ dari branch
    execSync(`git checkout refs/remotes/origin_session -- session/`, {
      stdio: "pipe",
      cwd: ROOT_DIR,
    });

    // Verifikasi
    if (isSessionValid()) {
      const files = fs.readdirSync(AUTH_DIR);
      console.log(`✅ Session berhasil di-restore! (${files.length} files)`);
      return true;
    } else {
      console.log("⚠️ Restore selesai tapi session tidak valid.");
      return false;
    }
  } catch (e) {
    console.log(`ℹ️  Tidak bisa restore session: ${e.message}`);
    console.log("   → Bot akan tampilkan QR Code untuk scan.");
    return false;
  }
}

// ==========================================
// INIT SESSION MANAGER
// ==========================================
async function initSessionManager() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔐 SESSION MANAGER                 ║");
  console.log("╚══════════════════════════════════════╝");

  ensureSessionDir();

  const gitOk = setupGit();

  if (gitOk) {
    const restored = await restoreSession();
    return restored;
  }

  // Jika git tidak dikonfigurasi, cek session lokal
  if (isSessionValid()) {
    console.log("✅ Session lokal ditemukan dan valid.");
    return true;
  }

  console.log("ℹ️  Tidak ada session — bot akan tampilkan QR Code.");
  return false;
}

module.exports = {
  initSessionManager,
  scheduleBackup,
  backupSession,
  restoreSession,
  isSessionValid,
  AUTH_DIR,
};
