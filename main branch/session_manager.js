// session_manager.js
// Auto backup auth_session ke GitHub setiap kali creds berubah

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.resolve("./auth_session");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: username/repo-name
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "session";

let backupTimeout = null;
let isConfigured = false;

// ==========================================
// SETUP GIT CONFIG
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
    // Set git config
    execSync(`git config --global user.email "bot@session.com"`, {
      stdio: "pipe",
    });
    execSync(`git config --global user.name "Bot Session"`, { stdio: "pipe" });

    // Set remote dengan token
    const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

    // Cek apakah remote sudah ada
    try {
      execSync(`git remote get-url origin`, { stdio: "pipe" });
      execSync(`git remote set-url origin ${remoteUrl}`, { stdio: "pipe" });
    } catch {
      execSync(`git remote add origin ${remoteUrl}`, { stdio: "pipe" });
    }

    // Cek/buat branch session
    try {
      execSync(`git fetch origin ${GITHUB_BRANCH} --depth=1`, {
        stdio: "pipe",
      });
      console.log(`✅ Git session branch '${GITHUB_BRANCH}' ditemukan.`);
    } catch {
      console.log(
        `ℹ️  Branch '${GITHUB_BRANCH}' belum ada, akan dibuat saat backup pertama.`,
      );
    }

    isConfigured = true;
    console.log(`✅ Session manager aktif → backup ke GitHub (${GITHUB_REPO})`);
    return true;
  } catch (e) {
    console.error(`❌ Setup git gagal: ${e.message}`);
    return false;
  }
}

// ==========================================
// BACKUP SESSION KE GITHUB
// ==========================================
async function backupSession() {
  if (!isConfigured) return;
  if (!fs.existsSync(AUTH_DIR)) return;

  const files = fs.readdirSync(AUTH_DIR);
  if (files.length === 0) return;

  try {
    console.log("💾 Backing up session ke GitHub...");

    // Add auth_session files
    execSync(`git add auth_session/ -f`, { stdio: "pipe" });

    // Cek apakah ada perubahan
    const status = execSync(`git status --porcelain auth_session/`, {
      stdio: "pipe",
    }).toString();

    if (!status.trim()) {
      // Tidak ada perubahan
      return;
    }

    // Commit
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "session: backup ${timestamp}"`, { stdio: "pipe" });

    // Push ke branch session
    try {
      execSync(`git push origin HEAD:${GITHUB_BRANCH}`, { stdio: "pipe" });
      console.log(`✅ Session berhasil di-backup ke branch '${GITHUB_BRANCH}'`);
    } catch {
      // Branch belum ada, buat baru
      execSync(`git push origin HEAD:${GITHUB_BRANCH} --force`, {
        stdio: "pipe",
      });
      console.log(`✅ Session branch '${GITHUB_BRANCH}' dibuat dan di-push`);
    }
  } catch (e) {
    // Jangan crash jika backup gagal
    if (!e.message.includes("nothing to commit")) {
      console.warn(`⚠️ Backup session gagal: ${e.message}`);
    }
  }
}

// ==========================================
// RESTORE SESSION DARI GITHUB
// ==========================================
async function restoreSession() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return false;

  try {
    console.log(
      `🔄 Mencoba restore session dari GitHub branch '${GITHUB_BRANCH}'...`,
    );

    const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

    // Fetch branch session
    execSync(
      `git fetch ${remoteUrl} ${GITHUB_BRANCH}:refs/remotes/session_remote --depth=1`,
      { stdio: "pipe" },
    );

    // Checkout auth_session dari branch session
    execSync(`git checkout refs/remotes/session_remote -- auth_session/`, {
      stdio: "pipe",
    });

    // Verifikasi
    if (fs.existsSync(path.join(AUTH_DIR, "creds.json"))) {
      console.log("✅ Session berhasil di-restore dari GitHub!");
      return true;
    } else {
      console.log("⚠️ Restore selesai tapi creds.json tidak ditemukan.");
      return false;
    }
  } catch (e) {
    console.log(`ℹ️  Tidak bisa restore session: ${e.message}`);
    return false;
  }
}

// ==========================================
// SCHEDULE BACKUP (debounced)
// ==========================================
function scheduleBackup(delayMs = 5000) {
  // Debounce — jangan backup terlalu sering
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    backupSession().catch((e) =>
      console.warn(`⚠️ scheduleBackup error: ${e.message}`),
    );
  }, delayMs);
}

// ==========================================
// INIT
// ==========================================
async function initSessionManager() {
  const gitOk = setupGit();

  if (gitOk) {
    // Coba restore dulu sebelum bot start
    const restored = await restoreSession();
    return restored;
  }

  return false;
}

module.exports = {
  initSessionManager,
  scheduleBackup,
  backupSession,
  restoreSession,
};
