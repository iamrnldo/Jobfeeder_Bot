// ==========================================
// LID_RESOLVER.JS
// Resolve LID → Nomor HP + Supabase Sync
// ==========================================

const lidToPhoneMap = new Map();
const phoneToLidMap = new Map();
let pgClient = null;
let isDbConnected = false;

// ==========================================
// CONNECT DATABASE
// ==========================================
async function connectDB() {
  if (isDbConnected && pgClient) {
    try {
      await pgClient.query("SELECT 1");
      return true;
    } catch {
      isDbConnected = false;
      pgClient = null;
    }
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) return false;

  try {
    const { Client } = require("pg");
    pgClient = new Client({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await pgClient.connect();
    isDbConnected = true;
    console.log("[LID] ✅ Database terhubung");
    return true;
  } catch (e) {
    console.log(`[LID] ⚠️ Database tidak terhubung: ${e.message}`);
    isDbConnected = false;
    pgClient = null;
    return false;
  }
}

// ==========================================
// HELPERS
// ==========================================
function isLidJid(jid) {
  if (!jid) return false;
  return jid.toLowerCase().endsWith("@lid");
}

function jidToDigits(jid) {
  if (!jid) return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

function isPhoneJid(jid) {
  if (!jid) return false;
  const domain = (jid.split("@")[1] || "").toLowerCase();
  return domain === "s.whatsapp.net" || domain === "c.us";
}

// ==========================================
// REGISTER MAPPING + SAVE TO SUPABASE
// ==========================================
async function registerLidMapping(lidJid, phone, source = "auto") {
  if (!lidJid || !phone) return;
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  if (cleanPhone.length < 8) return;

  const lidFull = lidJid.toLowerCase();
  const lidDigits = jidToDigits(lidJid);
  const isNew = !lidToPhoneMap.has(lidFull);

  // Simpan di memory
  lidToPhoneMap.set(lidFull, cleanPhone);
  lidToPhoneMap.set(lidDigits, cleanPhone);
  phoneToLidMap.set(cleanPhone, lidFull);

  if (isNew) {
    console.log(`🗂️  [LID] Mapped "${lidJid}" → "+${cleanPhone}"`);

    // Simpan ke Supabase (async, jangan block)
    saveLidToDatabase(lidFull, lidDigits, cleanPhone, source).catch((e) =>
      console.log(`[LID] ⚠️ Gagal save ke DB: ${e.message}`),
    );
  }
}

// ==========================================
// SAVE LID TO DATABASE
// ==========================================
async function saveLidToDatabase(lidJid, lidDigits, phone, source) {
  const ok = await connectDB();
  if (!ok) return;

  try {
    await pgClient.query(`SELECT upsert_lid_mapping($1, $2, $3, $4)`, [
      lidJid,
      lidDigits,
      phone,
      source,
    ]);
    console.log(`💾 [LID] Saved to Supabase: +${phone}`);
  } catch (e) {
    console.log(`❌ [LID] Save error: ${e.message}`);
  }
}

// ==========================================
// LOAD LID FROM DATABASE
// ==========================================
async function loadLidFromDatabase() {
  const ok = await connectDB();
  if (!ok) return 0;

  try {
    const result = await pgClient.query(
      "SELECT lid_jid, lid_digits, phone_number FROM whatsapp_lid_mappings",
    );

    let count = 0;
    for (const row of result.rows) {
      const lidFull = row.lid_jid.toLowerCase();
      const lidDigits = row.lid_digits;
      const phone = row.phone_number;

      lidToPhoneMap.set(lidFull, phone);
      if (lidDigits) lidToPhoneMap.set(lidDigits, phone);
      phoneToLidMap.set(phone, lidFull);
      count++;
    }

    if (count > 0) {
      console.log(`📥 [LID] Loaded ${count} mappings from Supabase`);
    }
    return count;
  } catch (e) {
    console.log(`❌ [LID] Load error: ${e.message}`);
    return 0;
  }
}

// ==========================================
// PROCESS CONTACT
// ==========================================
function processContact(contact) {
  if (!contact?.id) return;
  const id = contact.id;

  if (isPhoneJid(id) && contact.lid && isLidJid(contact.lid)) {
    const phone = jidToDigits(id);
    if (phone.length >= 8) registerLidMapping(contact.lid, phone, "contact");
    return;
  }

  if (isLidJid(id) && contact.lid && isPhoneJid(contact.lid)) {
    const phone = jidToDigits(contact.lid);
    if (phone.length >= 8) registerLidMapping(id, phone, "contact");
  }
}

function processContactsUpsert(contacts) {
  if (!Array.isArray(contacts)) return;
  let count = 0;
  for (const c of contacts) {
    const before = lidToPhoneMap.size;
    processContact(c);
    if (lidToPhoneMap.size > before) count++;
  }
  if (count > 0) {
    console.log(`   ✅ ${count} LID mappings baru dari contacts.upsert`);
  }
}

// ==========================================
// RESOLVE LID → NOMOR HP
// ==========================================
async function resolveMentionToPhone(sock, mentionJid, groupJid = null) {
  if (!mentionJid) return null;

  if (!isLidJid(mentionJid)) {
    const digits = jidToDigits(mentionJid);
    return digits.length >= 8 ? digits : null;
  }

  const lidFull = mentionJid.toLowerCase();
  const lidDigits = jidToDigits(mentionJid);

  console.log(`🔍 [LID] Resolving "${mentionJid}" (digits: ${lidDigits})`);

  // ── Strategi 1: In-memory cache ──
  const fromCache = lidToPhoneMap.get(lidFull) || lidToPhoneMap.get(lidDigits);
  if (fromCache) {
    console.log(`✅ [LID][Cache] → "+${fromCache}"`);
    return fromCache;
  }

  // ── Strategi 2: Database ──
  const fromDb = await loadLidFromDatabase();
  const fromDbCache =
    lidToPhoneMap.get(lidFull) || lidToPhoneMap.get(lidDigits);
  if (fromDbCache) {
    console.log(`✅ [LID][Database] → "+${fromDbCache}"`);
    return fromDbCache;
  }

  // ── Strategi 3: sock.store.contacts scan ──
  if (sock.store?.contacts) {
    for (const [contactId, contact] of Object.entries(sock.store.contacts)) {
      if (!contact) continue;

      if (
        contact.lid &&
        jidToDigits(contact.lid) === lidDigits &&
        isPhoneJid(contactId)
      ) {
        const phone = jidToDigits(contactId);
        if (phone.length >= 8) {
          console.log(`✅ [LID][Store-scan lid field] → "+${phone}"`);
          registerLidMapping(mentionJid, phone, "store");
          return phone;
        }
      }

      if (
        isLidJid(contactId) &&
        jidToDigits(contactId) === lidDigits &&
        (contact.phone || contact.notify)
      ) {
        const phone = (contact.phone || "").replace(/[^0-9]/g, "");
        if (phone.length >= 8) {
          console.log(`✅ [LID][Store contact.phone] → "+${phone}"`);
          registerLidMapping(mentionJid, phone, "store");
          return phone;
        }
      }
    }
  }

  // ── Strategi 4: groupMetadata ──
  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const participants = meta.participants || [];

      for (const p of participants) {
        // p.id = phone, p.lid = LID
        if (p.lid && isPhoneJid(p.id) && isLidJid(p.lid)) {
          const phone = jidToDigits(p.id);
          if (phone.length >= 8) {
            registerLidMapping(p.lid, phone, "group");
            if (jidToDigits(p.lid) === lidDigits) {
              console.log(`✅ [LID][Group p.lid] → "+${phone}"`);
              return phone;
            }
          }
        }

        // p.id = LID, p.lid = phone — reversed
        if (p.lid && isLidJid(p.id) && isPhoneJid(p.lid)) {
          const phone = jidToDigits(p.lid);
          if (phone.length >= 8) {
            registerLidMapping(p.id, phone, "group");
            if (jidToDigits(p.id) === lidDigits) {
              console.log(`✅ [LID][Group p.id=lid] → "+${phone}"`);
              return phone;
            }
          }
        }
      }
    } catch (e) {
      console.error(`   [LID] groupMetadata error: ${e.message}`);
    }
  }

  // ── Strategi 5: Gagal ──
  console.log(
    `❌ [LID] Cannot resolve "${mentionJid}" | ` +
      `LID map: ${lidToPhoneMap.size} | ` +
      `store: ${Object.keys(sock.store?.contacts || {}).length}`,
  );
  return null;
}

// ==========================================
// DEBUG
// ==========================================
function getLidMapSize() {
  return lidToPhoneMap.size;
}

function getLidMapEntries() {
  return Array.from(lidToPhoneMap.entries());
}

// ==========================================
// INIT — Load dari Database saat start
// ==========================================
async function initLidResolver() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🗂️  LID RESOLVER INIT              ║");
  console.log("╚══════════════════════════════════════╝");

  const count = await loadLidFromDatabase();
  console.log(`📊 Total LID mappings: ${lidToPhoneMap.size}`);

  return count;
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  initLidResolver,
  registerLidMapping,
  resolveMentionToPhone,
  processContact,
  processContactsUpsert,
  isLidJid,
  isPhoneJid,
  jidToDigits,
  getLidMapSize,
  getLidMapEntries,
  connectDB,
};
