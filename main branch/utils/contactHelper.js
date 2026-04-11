// ==========================================
//  UTILS/CONTACTHELPER.JS
//  Helper untuk resolve nama kontak dari JID
// ==========================================

/**
 * Ekstrak digit dari JID
 * "628xxx:12@s.whatsapp.net" → "628xxx"
 */
function jidToDigits(jid) {
  if (!jid) return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

/**
 * Ambil nama dari participant object
 * Sumber: notify → name → verifiedName → nomor
 */
function getParticipantName(participant) {
  if (!participant) return "Unknown";

  const name =
    participant.notify || participant.name || participant.verifiedName || null;

  if (name && name.trim()) return name.trim();

  return jidToDigits(participant.id);
}

/**
 * Ambil nama dari in-memory store
 */
function getNameFromStore(store, jid) {
  if (!store) return null;
  try {
    const contact = store.contacts?.[jid];
    if (contact) {
      return contact.notify || contact.name || contact.verifiedName || null;
    }
  } catch (e) {}
  return null;
}

/**
 * Resolve nama terbaik untuk JID
 * Priority: store → participant.notify → nomor
 */
function resolveName(jid, participants = [], store = null) {
  const number = jidToDigits(jid);

  if (store) {
    const storeName = getNameFromStore(store, jid);
    if (storeName) return storeName;
  }

  const participant = participants.find((p) => p.id === jid);
  if (participant) {
    const name = getParticipantName(participant);
    if (name && name !== number) return name;
  }

  return number;
}

module.exports = {
  jidToDigits,
  getParticipantName,
  getNameFromStore,
  resolveName,
};
