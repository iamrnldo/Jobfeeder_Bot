// ==========================================
//  LID_RESOLVER.JS
//  Resolve LID → Nomor HP
// ==========================================

const lidToPhoneMap = new Map();
const phoneToLidMap = new Map();

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
// REGISTER MAPPING
// ==========================================
function registerLidMapping(lidJid, phone) {
  if (!lidJid || !phone) return;
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  if (cleanPhone.length < 8) return;

  const lidFull = lidJid.toLowerCase();
  const lidDigits = jidToDigits(lidJid);
  const isNew = !lidToPhoneMap.has(lidFull);

  lidToPhoneMap.set(lidFull, cleanPhone);
  lidToPhoneMap.set(lidDigits, cleanPhone);
  phoneToLidMap.set(cleanPhone, lidFull);

  if (isNew) {
    console.log(`🗂️  [LID] Mapped "${lidJid}" → "+${cleanPhone}"`);
  }
}

function processContact(contact) {
  if (!contact?.id) return;
  const id = contact.id;

  if (isPhoneJid(id) && contact.lid && isLidJid(contact.lid)) {
    const phone = jidToDigits(id);
    if (phone.length >= 8) registerLidMapping(contact.lid, phone);
    return;
  }

  if (isLidJid(id) && contact.lid && isPhoneJid(contact.lid)) {
    const phone = jidToDigits(contact.lid);
    if (phone.length >= 8) registerLidMapping(id, phone);
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

  // ── Strategi 2: sock.store.contacts scan ──
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
          registerLidMapping(mentionJid, phone);
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
          registerLidMapping(mentionJid, phone);
          return phone;
        }
      }
    }
  }

  // ── Strategi 3: groupMetadata ──
  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const participants = meta.participants || [];

      console.log(`   [Group] ${participants.length} participants:`);

      for (const p of participants) {
        console.log(
          `     • id:${p.id}` +
            (p.lid ? ` | lid:${p.lid}` : "") +
            (p.name ? ` | name:${p.name}` : ""),
        );

        // p.id = phone, p.lid = LID — simpan semua
        if (p.lid && isPhoneJid(p.id) && isLidJid(p.lid)) {
          const phone = jidToDigits(p.id);
          if (phone.length >= 8) {
            registerLidMapping(p.lid, phone);
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
            registerLidMapping(p.id, phone);
            if (jidToDigits(p.id) === lidDigits) {
              console.log(`✅ [LID][Group p.id=lid] → "+${phone}"`);
              return phone;
            }
          }
        }

        // p.id = LID cocok → cek store
        if (isLidJid(p.id) && jidToDigits(p.id) === lidDigits) {
          const storeContact = sock.store?.contacts?.[p.id];
          if (storeContact?.phone) {
            const phone = storeContact.phone.replace(/[^0-9]/g, "");
            if (phone.length >= 8) {
              console.log(`✅ [LID][Group+Store phone] → "+${phone}"`);
              registerLidMapping(mentionJid, phone);
              return phone;
            }
          }
        }
      }
    } catch (e) {
      console.error(`   [LID] groupMetadata error: ${e.message}`);
    }
  }

  // ── Strategi 4: Gagal ──
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

module.exports = {
  registerLidMapping,
  resolveMentionToPhone,
  processContact,
  processContactsUpsert,
  isLidJid,
  isPhoneJid,
  jidToDigits,
  getLidMapSize,
  getLidMapEntries,
};
