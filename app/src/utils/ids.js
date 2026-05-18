// Client-stable record ids. The id MUST be minted once per record and
// reused on every re-save — that is what makes a write idempotent
// against the Worker's `INSERT … ON CONFLICT(id) DO UPDATE` upsert.
// Minting a fresh id per submit (the manual-add duplicate bug, May 2026)
// defeats the conflict clause and inserts a new row per tap.

function uuidv4() {
  // Secure context (https / localhost) — the PWA always runs in one.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: RFC-4122 v4 from getRandomValues, else Math.random.
  const buf = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  buf[6] = (buf[6] & 0x0f) | 0x40
  buf[8] = (buf[8] & 0x3f) | 0x80
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

// Namespaced so trip ids stay visually distinct from memory ids in D1
// and logs. Existing seed ids (jackson-2026, nyc-rafa-2026) keep their
// hand-authored names; only generated ids use this.
export function newTripId() {
  return `trip_${uuidv4()}`
}
