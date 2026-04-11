// ==========================================
// SESSION_MANAGER.JS
// ==========================================

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

// ==========================================
// PATHS
// ==========================================
// __dirname = /app/main branch/
// session/  = /app/session/
const MAIN_DIR = path.resolve(__dirname); // /app/main branch/
const ROOT_DIR = path.resolve(__dirname, ".."); // /app/
const AUTH_DIR = path.resolve(ROOT_DIR, "session"); // /app/session/

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "master";

let isConfigured = false;
let backupTimeout = null;

// ==========================================
// LOGGING HELPER
// ==========================================
function log(msg) {
  console.log(`[SessionManager] ${msg}`);
}

// ==========================================
// ENSURE SESSION DIR
// ==========================================
function ensureSessionDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    log(`📁 Folder session dibuat: ${AUTH_DIR}`);
  }
}

// ==========================================
// CEK SESSION VALID
// ==========================================
function isSessionValid() {
  const credsPath = path.join(AUTH_DIR, "creds.json");

  if (!fs.existsSync(credsPath)) {
    log(`❌ creds.json tidak ada di: ${credsPath}`);
    return false;
  }

  try {
    const raw = fs.readFileSync(credsPath, "utf-8");
    const creds = JSON.parse(raw);
    const valid = !!(creds.me || creds.noiseKey || creds.signedIdentityKey);
    if (valid) {
      log(`✅ Session valid: ${credsPath}`);
    } else {
      log(`⚠️ creds.json ada tapi field kosong`);
    }
    return valid;
  } catch (e) {
    log(`❌ creds.json tidak bisa dibaca: ${e.message}`);
    return false;
  }
}

// ==========================================
// EXEC HELPER — tidak throw, return result
// ==========================================
function exec(cmd, cwd = ROOT_DIR) {
  const result = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: "utf-8",
    timeout: 30000,
  });

  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    status: result.status,
  };
}

// ==========================================
// SETUP GIT CONFIG
// ==========================================
function setupGit() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    log("⚠️ GITHUB_TOKEN atau GITHUB_REPO tidak diset di env.");
    log("   Session hanya tersimpan lokal.");
    return false;
  }

  log(`🔧 Setup git config...`);

  exec(`git config --global user.email "bot@whatsapp.com"`);
  exec(`git config --global user.name "WhatsApp Bot"`);
  exec(`git config --global --add safe.directory ${ROOT_DIR}`);
  exec(`git config --global --add safe.directory ${MAIN_DIR}`);

  const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

  // Set remote
  const hasRemote = exec(`git remote get-url origin`);
  if (hasRemote.ok) {
    exec(`git remote set-url origin "${remoteUrl}"`);
  } else {
    exec(`git remote add origin "${remoteUrl}"`);
  }

  isConfigured = true;
  log(`✅ Git configured → ${GITHUB_REPO} (branch: ${GITHUB_BRANCH})`);
  return true;
}

// ==========================================
// RESTORE SESSION DARI GITHUB
// Download file session/ langsung via GitHub API
// ==========================================
async function restoreSession() {
  log("\n🔄 Mencoba restore session dari GitHub...");
  log(`   Repo  : ${GITHUB_REPO}`);
  log(`   Branch: ${GITHUB_BRANCH}`);
  log(`   Folder: session/`);
  log(`   Target: ${AUTH_DIR}`);

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    log("⚠️ Token/Repo tidak diset, skip restore.");
    return false;
  }

  ensureSessionDir();

  // Jika session sudah valid, skip restore
  if (isSessionValid()) {
    log("✅ Session sudah valid, skip restore dari GitHub.");
    return true;
  }

  try {
    // ── Cara 1: git sparse-checkout (paling reliable) ──
    const restored = await restoreViaGit();
    if (restored && isSessionValid()) {
      log("✅ Session berhasil di-restore via git!");
      return true;
    }

    // ── Cara 2: GitHub API (fallback) ──
    log("⚠️ Git restore gagal, coba via GitHub API...");
    const restoredApi = await restoreViaAPI();
    if (restoredApi && isSessionValid()) {
      log("✅ Session berhasil di-restore via GitHub API!");
      return true;
    }

    log("❌ Restore gagal. Bot akan tampilkan QR Code.");
    return false;
  } catch (e) {
    log(`❌ Restore error: ${e.message}`);
    return false;
  }
}

// ==========================================
// RESTORE VIA GIT
// ==========================================
async function restoreViaGit() {
  try {
    const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

    // Init git di ROOT jika belum
    const isGitRepo = fs.existsSync(path.join(ROOT_DIR, ".git"));
    if (!isGitRepo) {
      log("📁 Init git repo di root...");
      exec(`git init`, ROOT_DIR);
      exec(`git remote add origin "${remoteUrl}"`, ROOT_DIR);
    }

    log("📥 Fetching branch dari GitHub...");
    const fetchResult = exec(
      `git fetch origin ${GITHUB_BRANCH} --depth=1 --no-tags`,
      ROOT_DIR,
    );

    if (!fetchResult.ok) {
      log(`❌ git fetch gagal: ${fetchResult.stderr}`);
      return false;
    }

    log("📂 Checkout folder session/...");
    const checkoutResult = exec(
      `git checkout origin/${GITHUB_BRANCH} -- session/`,
      ROOT_DIR,
    );

    if (!checkoutResult.ok) {
      // Coba dengan FETCH_HEAD
      const checkoutResult2 = exec(
        `git checkout FETCH_HEAD -- session/`,
        ROOT_DIR,
      );
      if (!checkoutResult2.ok) {
        log(`❌ git checkout gagal: ${checkoutResult2.stderr}`);
        return false;
      }
    }

    // Verifikasi
    const files = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
    log(`📂 Files di session/: ${files.length} files`);
    return files.length > 0;
  } catch (e) {
    log(`❌ restoreViaGit error: ${e.message}`);
    return false;
  }
}

// ==========================================
// RESTORE VIA GITHUB API
// Download file satu per satu via API
// ==========================================
async function restoreViaAPI() {
  try {
    const https = require("https");

    // Fungsi request helper
    function httpsGet(url, headers = {}) {
      return new Promise((resolve, reject) => {
        const options = {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "User-Agent": "WhatsApp-Bot",
            Accept: "application/vnd.github.v3+json",
            ...headers,
          },
        };

        https
          .get(url, options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve({ status: res.statusCode, data: JSON.parse(data) });
              } catch {
                resolve({ status: res.statusCode, data });
              }
            });
          })
          .on("error", reject);
      });
    }

    function httpsGetRaw(url, headers = {}) {
      return new Promise((resolve, reject) => {
        const options = {
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "User-Agent": "WhatsApp-Bot",
            ...headers,
          },
        };

        https
          .get(url, options, (res) => {
            // Handle redirect
            if (res.statusCode === 302 || res.statusCode === 301) {
              return httpsGetRaw(res.headers.location, {})
                .then(resolve)
                .catch(reject);
            }

            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          })
          .on("error", reject);
      });
    }

    // Get daftar file di folder session/
    const [owner, repo] = GITHUB_REPO.split("/");
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/session?ref=${GITHUB_BRANCH}`;

    log(`📡 GitHub API: ${apiUrl}`);
    const { status, data } = await httpsGet(apiUrl);

    if (status !== 200) {
      log(`❌ API error: status ${status}`);
      if (typeof data === "object" && data.message) {
        log(`   Message: ${data.message}`);
      }
      return false;
    }

    if (!Array.isArray(data)) {
      log(`❌ API response bukan array`);
      return false;
    }

    log(`📦 Ditemukan ${data.length} files di session/`);
    ensureSessionDir();

    // Download setiap file
    let downloaded = 0;
    for (const file of data) {
      if (file.type !== "file") continue;

      try {
        const filePath = path.join(AUTH_DIR, file.name);
        const buffer = await httpsGetRaw(file.download_url);
        fs.writeFileSync(filePath, buffer);
        downloaded++;
        log(`   ✅ ${file.name} (${buffer.length} bytes)`);
      } catch (e) {
        log(`   ❌ Gagal download ${file.name}: ${e.message}`);
      }
    }

    log(`📦 Downloaded: ${downloaded}/${data.length} files`);
    return downloaded > 0;
  } catch (e) {
    log(`❌ restoreViaAPI error: ${e.message}`);
    return false;
  }
}

// ==========================================
// BACKUP SESSION KE GITHUB
// ==========================================
async function backupSession() {
  if (!isConfigured && !setupGit()) {
    log("⚠️ Git tidak terkonfigurasi, skip backup.");
    return;
  }

  ensureSessionDir();

  const files = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
  if (files.length === 0) {
    log("⚠️ Session kosong, skip backup.");
    return;
  }

  log(`💾 Backing up ${files.length} session files ke GitHub...`);

  try {
    // Pastikan kita di branch yang benar
    const currentBranch = exec(`git rev-parse --abbrev-ref HEAD`, ROOT_DIR);
    log(`   Current branch: ${currentBranch.stdout}`);

    // Add folder session/
    const addResult = exec(`git add session/ -f`, ROOT_DIR);
    if (!addResult.ok) {
      log(`⚠️ git add warning: ${addResult.stderr}`);
    }

    // Cek ada perubahan
    const statusResult = exec(`git status --porcelain session/`, ROOT_DIR);
    if (!statusResult.stdout.trim()) {
      log("ℹ️  Session tidak berubah, skip backup.");
      return;
    }

    // Commit
    const timestamp = new Date().toISOString();
    const commitResult = exec(
      `git commit -m "session: backup ${timestamp}"`,
      ROOT_DIR,
    );

    if (
      !commitResult.ok &&
      !commitResult.stdout.includes("nothing to commit")
    ) {
      log(`⚠️ git commit: ${commitResult.stderr}`);
    }

    // Push
    const pushResult = exec(
      `git push origin HEAD:${GITHUB_BRANCH} --force`,
      ROOT_DIR,
    );

    if (pushResult.ok) {
      log(`✅ Session berhasil di-backup ke GitHub!`);
      log(`   Branch: ${GITHUB_BRANCH}`);
      log(`   Files : ${files.length}`);
    } else {
      log(`❌ Push gagal: ${pushResult.stderr}`);
    }
  } catch (e) {
    log(`❌ Backup error: ${e.message}`);
  }
}

// ==========================================
// SCHEDULE BACKUP (debounced)
// ==========================================
function scheduleBackup(delayMs = 5000) {
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    backupSession().catch((e) => log(`⚠️ scheduleBackup error: ${e.message}`));
  }, delayMs);
}

// ==========================================
// INIT SESSION MANAGER
// ==========================================
async function initSessionManager() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🔐 SESSION MANAGER                 ║");
  console.log("╚══════════════════════════════════════╝");

  log(`ROOT_DIR : ${ROOT_DIR}`);
  log(`AUTH_DIR : ${AUTH_DIR}`);
  log(`REPO     : ${GITHUB_REPO || "tidak diset"}`);
  log(`BRANCH   : ${GITHUB_BRANCH}`);

  ensureSessionDir();
  setupGit();

  // Cek session lokal dulu
  if (isSessionValid()) {
    log("✅ Session lokal valid, tidak perlu restore.");
    return true;
  }

  // Restore dari GitHub
  const restored = await restoreSession();
  return restored;
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  initSessionManager,
  scheduleBackup,
  backupSession,
  restoreSession,
  isSessionValid,
  AUTH_DIR,
};
