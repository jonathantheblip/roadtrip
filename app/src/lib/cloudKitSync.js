// CloudKit sync layer. Spec §4.
//
// Architecture: localStorage stays as the canonical write target — every
// saveMemory / deleteMemory / saveTrip mutation lands locally first so
// the UI is instant and offline-tolerant. This module mirrors those
// mutations to CloudKit asynchronously and pulls remote records into
// the local cache on sign-in / refresh.
//
// CloudKit-native sharing model (post-2026-05-02 audit):
//   • Owner writes shared records to privateCloudDatabase, "Family"
//     custom zone. The zone is shared via a CKShare (created from
//     Settings → "Invite family"); recipients see the same records in
//     their sharedCloudDatabase under the same zoneID after accepting
//     the share invitation.
//   • Owner writes own private records to privateCloudDatabase,
//     _defaultZone. Never shared, never visible to recipients.
//   • Recipients (after accepting) write back into the shared zone via
//     their sharedCloudDatabase — CloudKit routes writes to the owner.
//
// Database scope per record + visibility:
//   Memory  visibility=shared  → privateCloudDatabase / Family   (owner)
//                                sharedCloudDatabase  / Family   (recipient)
//   Memory  visibility=private → privateCloudDatabase / _default (only owner)
//   Trip                       → privateCloudDatabase / Family   (owner)
//                                sharedCloudDatabase  / Family   (recipient)
//
// Conflict resolution: last-write-wins by `updatedAt` timestamp.
// CloudKit assigns a recordChangeTag we honour for delete-vs-update
// races; locally-newer updates beat remote-older ones.
//
// Assets: audioRef and photoRef both translate to a CloudKit CKAsset
// uploaded from the IDB blob. The Memory record stores the CKAsset
// reference under `audioAsset` / `photoAsset`. Local cache keeps the
// IDB key alive so playback stays instant.

import { getContainer, isCloudKitConfigured } from './cloudkit'
import { loadAsset } from './memAssets'

const RECORD_TYPE = 'Memory'
const TRIP_RECORD_TYPE = 'Trip'
export const SHARED_ZONE = 'Family'

// ─── Family zone bootstrap ──────────────────────────────────────────
//
// CloudKit JS won't auto-create custom zones — saving a record into a
// non-existent zone fails with `ZONE_NOT_FOUND`. We lazy-create the
// Family zone in the owner's privateCloudDatabase the first time we
// need to write to it. Recipients don't create it (they receive it via
// CKShare); they look it up in their sharedCloudDatabase.

let zoneEnsuredP = null
async function ensureFamilyZone() {
  if (zoneEnsuredP) return zoneEnsuredP
  zoneEnsuredP = (async () => {
    const container = await getContainer()
    const priv = container.privateCloudDatabase
    try {
      const existing = await priv.fetchRecordZones([{ zoneName: SHARED_ZONE }])
      const found = existing?.zones?.some?.(
        (z) => z?.zoneID?.zoneName === SHARED_ZONE
      )
      if (found) return true
    } catch {
      /* fall through and try to create */
    }
    try {
      await priv.saveRecordZones([{ zoneID: { zoneName: SHARED_ZONE } }])
      return true
    } catch (err) {
      console.warn('CloudKit ensureFamilyZone failed', err)
      zoneEnsuredP = null // allow retry on next call
      return false
    }
  })()
  return zoneEnsuredP
}

// ─── Memory records ─────────────────────────────────────────────────
//
// Pull every Memory record across both databases (owner sees their own
// in privateCloudDatabase; recipients see the owner's in
// sharedCloudDatabase). Used by sign-in / refresh.

export async function pullAll() {
  if (!isCloudKitConfigured()) return []
  const container = await getContainer()
  const out = []
  const errors = []

  // Own private memories — privateCloudDatabase _defaultZone
  try {
    const priv = container.privateCloudDatabase
    const r = await priv.performQuery({ recordType: RECORD_TYPE })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'private'))
  } catch (err) {
    console.warn('CloudKit pullAll(private/default) failed', err)
    errors.push(`private/default: ${err?.message || String(err)}`)
  }

  // Shared memories the user owns — privateCloudDatabase Family zone.
  // Same caveat as the sharedCloudDatabase path below: performQuery
  // against a custom zone needs a queryable recordName index in the
  // container schema, which dev-auto-create and Promote-to-Production
  // both miss by default — the query silently returns empty even after
  // a successful saveRecords. fetchRecordZoneChanges walks the zone's
  // change feed and works without any indexes.
  try {
    const priv = container.privateCloudDatabase
    const records = await fetchAllFromSharedZone(priv, RECORD_TYPE)
    for (const rec of records) out.push(fromCKRecord(rec, 'shared'))
  } catch (err) {
    // Family zone not yet created — normal for first-time owner.
    console.warn('CloudKit pullAll(private/family) failed', err)
    errors.push(`private/family: ${err?.message || String(err)}`)
  }

  // Shared memories another family member owns — sharedCloudDatabase
  // Family zone (only present after accepting a share invitation).
  // sharedCloudDatabase rejects performQuery with a bare zoneID
  // ("SharedDB does not support Zone Wide queries"); fetchRecordZoneChanges
  // is the supported way to enumerate everything in a shared zone.
  try {
    const shared = container.sharedCloudDatabase
    const records = await fetchAllFromSharedZone(shared, RECORD_TYPE)
    for (const rec of records) out.push(fromCKRecord(rec, 'shared'))
  } catch (err) {
    // Recipient hasn't accepted a share yet, or no share exists.
    console.warn('CloudKit pullAll(shared/family) failed', err)
    errors.push(`shared/family: ${err?.message || String(err)}`)
  }

  if (errors.length) out.errors = errors
  return out
}

// Walk every record in the shared Family zone via fetchRecordZoneChanges.
// Filters to `recordType` client-side because the CloudKit JS API for this
// call doesn't accept a record-type filter — the change feed includes all
// types in the zone. Pages through `moreComing` if the response is large.
//
// Annotates the returned array with .zoneCounts (e.g. {Memory: 5, Trip: 2})
// so callers can surface "the zone has these types" diagnostics when their
// type-of-interest comes back empty.
async function fetchAllFromSharedZone(db, recordType) {
  const out = []
  const zoneCounts = {}
  let serverChangeToken = undefined
  for (let page = 0; page < 20; page++) {
    let resp
    try {
      resp = await db.fetchRecordZoneChanges({
        zones: [
          {
            zoneID: { zoneName: SHARED_ZONE },
            ...(serverChangeToken ? { serverChangeToken } : {}),
          },
        ],
      })
    } catch (err) {
      if (page === 0) throw err
      break
    }
    const zoneResp = resp?.zones?.[0]
    const records = zoneResp?.records || []
    for (const rec of records) {
      const t = rec.recordType || '<no-type>'
      zoneCounts[t] = (zoneCounts[t] || 0) + 1
      if (!recordType || rec.recordType === recordType) out.push(rec)
    }
    serverChangeToken = zoneResp?.syncToken || zoneResp?.serverChangeToken
    if (!resp?.moreComing && !zoneResp?.moreComing) break
    if (!serverChangeToken) break
  }
  out.zoneCounts = zoneCounts
  return out
}

// Push a single Memory record. Audio / photo blobs become CKAssets.
// Routing rules:
//   visibility=private → privateCloudDatabase / _defaultZone
//   visibility=shared  → privateCloudDatabase / Family zone (owner) OR
//                        sharedCloudDatabase  / Family zone (recipient,
//                        if their CloudKit role for the zone permits
//                        writes — typically "read-write" participants).
// We try the owner path first; on a `not the owner` style failure we
// fall through to sharedCloudDatabase for the recipient case.

export async function pushMemory(memory) {
  if (!isCloudKitConfigured()) return null
  const container = await getContainer()

  // Upload assets if we still have local blobs.
  let audioAsset
  if (memory.audioRef?.key) {
    const blob = await loadAsset('audio', memory.audioRef.key)
    if (blob) {
      audioAsset = await blobToCKAsset(blob, `${memory.id}-audio`)
    }
  }
  let photoAsset
  if (memory.photoRef?.key) {
    const blob = await loadAsset('photo', memory.photoRef.key)
    if (blob) {
      photoAsset = await blobToCKAsset(blob, `${memory.id}-photo`)
    }
  }

  const fields = toCKFields(memory, { audioAsset, photoAsset })
  const isShared = memory.visibility !== 'private'

  if (isShared) await ensureFamilyZone()

  const record = {
    recordType: RECORD_TYPE,
    recordName: memory.id,
    fields,
  }
  if (isShared) record.zoneID = { zoneName: SHARED_ZONE }

  // Try owner-side first (privateCloudDatabase). Falls through to
  // sharedCloudDatabase ONLY if the privateDB error looks like
  // "you're a recipient, not the owner" — typically ZONE_NOT_FOUND
  // because the recipient's own privateCloudDatabase doesn't have
  // someone else's Family zone. For any other privateDB error
  // (schema, validation, auth) we surface the real reason instead
  // of layering a confusing sharedDB error on top.
  if (isShared) {
    let privErr = null
    try {
      await saveOrUpdate(container.privateCloudDatabase, record)
      return true
    } catch (err) {
      privErr = err
    }
    const looksLikeRecipient = /zone[_ ]not[_ ]found|zonenotfound/i.test(
      privErr?.message || ''
    )
    if (!looksLikeRecipient) {
      console.warn('CloudKit pushMemory(private/family) failed', privErr)
      throw privErr
    }
    try {
      await saveOrUpdate(container.sharedCloudDatabase, record)
      return true
    } catch (err2) {
      console.warn('CloudKit pushMemory(shared) failed', err2 || privErr)
      throw new Error(
        `priv: ${privErr?.message || 'unknown'} · shared: ${err2?.message || 'unknown'}`
      )
    }
  }

  try {
    await saveOrUpdate(container.privateCloudDatabase, record)
    return true
  } catch (err) {
    console.warn('CloudKit pushMemory(private) failed', err)
    throw err
  }
}

// Wrap saveRecords with conflict-aware upsert. CloudKit treats a save
// without a recordChangeTag as create-only and rejects with CONFLICT
// when the recordName already exists server-side. Re-pushing the same
// record (Settings → "Push memories") and edits-then-mirror both hit
// this. On CONFLICT we fetch the existing record's recordChangeTag
// and retry the save with it; CloudKit then treats the call as an
// update and overwrites server state with our local fields.
// Diagnostic: capture the actual zone each save lands in. CloudKit JS
// has been ignoring our zoneID hints in some configurations — knowing
// where saves actually go is the only way to confirm whether a fix is
// working. Settings can call takeRecentSaves() to surface this in the
// UI after a Push / Seed run.
let recentSaves = []
function recordSave(savedRec) {
  recentSaves.push({
    zone: savedRec?.zoneID?.zoneName || '<unknown>',
    type: savedRec?.recordType || '<no-type>',
    name: savedRec?.recordName || '<no-name>',
  })
  if (recentSaves.length > 50) recentSaves = recentSaves.slice(-50)
}
export function takeRecentSaves() {
  const r = recentSaves
  recentSaves = []
  return r
}

async function saveOrUpdate(db, record) {
  // CloudKit JS empirically ignores per-record `zoneID` when no call-level
  // zoneID option is passed — records silently land in _defaultZone even
  // when each record sets `zoneID: { zoneName: 'Family' }`. Pass the
  // zoneID at the call level too to force routing into the Family zone.
  // (Symptom that surfaced this 2026-05-03: Family zone showed empty in
  // dashboard despite many "successful" pushes; pullAll's _defaultZone
  // performQuery source happily returned the misrouted records, hiding
  // the bug. Same root cause for "trip pull returns 0" and "invite popup
  // hangs forever" — the popup was trying to share an empty zone.)
  const callOpts = record.zoneID ? { zoneID: record.zoneID } : undefined
  try {
    const r = await db.saveRecords([record], callOpts)
    throwIfRecordErrors(r)
    for (const saved of r.records || []) recordSave(saved)
    return r
  } catch (err) {
    if (!/CONFLICT|record to insert already exists/i.test(err?.message || '')) {
      throw err
    }
    const ref = { recordName: record.recordName }
    if (record.zoneID) ref.zoneID = record.zoneID
    const fetched = await db.fetchRecords([ref])
    const tag = fetched?.records?.[0]?.recordChangeTag
    if (!tag) throw err
    const r2 = await db.saveRecords([{ ...record, recordChangeTag: tag }], callOpts)
    throwIfRecordErrors(r2)
    for (const saved of r2.records || []) recordSave(saved)
    return r2
  }
}

// CloudKit JS saveRecords resolves the promise even when individual
// records fail server-side — the per-record error is on the response,
// not thrown. Without this check, callers see "success" while the
// record never actually landed.
function throwIfRecordErrors(resp) {
  const records = resp?.records || []
  for (const r of records) {
    const code = r?.serverErrorCode || r?.errorCode
    const reason = r?.reason || r?.errorReason
    if (code || reason) {
      throw new Error(`${code || 'CK_SAVE_FAILED'}${reason ? ': ' + reason : ''}`)
    }
  }
  if (resp?.errors?.length) {
    const e = resp.errors[0]
    throw new Error(`${e?.serverErrorCode || 'CK_SAVE_FAILED'}: ${e?.reason || JSON.stringify(e)}`)
  }
}

// Delete a Memory record. Mirror of pushMemory's routing.
export async function deleteRemote(memory) {
  if (!isCloudKitConfigured()) return null
  const container = await getContainer()
  const isShared = memory.visibility !== 'private'
  const ref = { recordName: memory.id }
  if (isShared) ref.zoneID = { zoneName: SHARED_ZONE }

  if (isShared) {
    try {
      await container.privateCloudDatabase.deleteRecords([ref])
      return true
    } catch {
      try {
        await container.sharedCloudDatabase.deleteRecords([ref])
        return true
      } catch (err2) {
        console.warn('CloudKit deleteRemote(shared) failed', err2)
        return false
      }
    }
  }

  try {
    await container.privateCloudDatabase.deleteRecords([ref])
    return true
  } catch (err) {
    console.warn('CloudKit deleteRemote(private) failed', err)
    return false
  }
}

// ─── translation helpers ────────────────────────────────────────────

function toCKFields(m, { audioAsset, photoAsset } = {}) {
  const f = {}
  // CloudKit auto-capitalizes `Id` → `ID` (Cocoa acronym convention) when
  // a record type is defined via the dashboard, so the wire-format keys
  // are tripID/stopID even though the local Memory shape stays tripId/stopId.
  put(f, 'tripID', m.tripId)
  put(f, 'stopID', m.stopId)
  put(f, 'authorTraveler', m.authorTraveler)
  put(f, 'visibility', m.visibility)
  put(f, 'kind', m.kind)
  put(f, 'text', m.text)
  put(f, 'caption', m.caption)
  put(f, 'transcript', m.transcript)
  put(f, 'transcriptLang', m.transcriptLang)
  put(f, 'transcriptionStatus', m.transcriptionStatus)
  put(f, 'durationSeconds', m.durationSeconds)
  put(f, 'mood', m.mood)
  // Schema declares createdAt / updatedAt as Int64 (ms since epoch).
  // The local Memory shape uses ISO strings; convert at the wire
  // boundary so the schema doesn't have to change.
  put(f, 'createdAt', toEpochMs(m.createdAt))
  put(f, 'updatedAt', toEpochMs(m.updatedAt))
  // CloudKit can't natively store arrays of records; reactions ride
  // along as a JSON blob.
  if (m.reactions?.length) {
    put(f, 'reactionsJson', JSON.stringify(m.reactions))
  }
  if (audioAsset) f.audioAsset = { value: audioAsset }
  if (photoAsset) f.photoAsset = { value: photoAsset }
  return f
}

function put(fields, key, value) {
  if (value === undefined || value === null || value === '') return
  fields[key] = { value }
}

// ISO string → ms since epoch. Numbers pass through. Returns undefined
// for unparseable input so `put` skips the field instead of saving NaN.
function toEpochMs(v) {
  if (v == null) return undefined
  if (typeof v === 'number') return v
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? ms : undefined
}

// ms since epoch → ISO string. Strings pass through (already ISO).
function fromEpochMs(v) {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  return undefined
}

function fromCKRecord(rec, visibilityHint) {
  const f = rec.fields || {}
  const v = (k) => (f[k] ? f[k].value : undefined)
  let reactions = []
  try {
    if (f.reactionsJson?.value) reactions = JSON.parse(f.reactionsJson.value)
  } catch {
    /* malformed — ignore */
  }
  return {
    id: rec.recordName,
    tripId: v('tripID'),
    stopId: v('stopID'),
    authorTraveler: v('authorTraveler'),
    visibility: v('visibility') || visibilityHint || 'shared',
    kind: v('kind') || 'text',
    text: v('text'),
    caption: v('caption'),
    transcript: v('transcript'),
    transcriptLang: v('transcriptLang'),
    transcriptionStatus: v('transcriptionStatus'),
    durationSeconds: v('durationSeconds'),
    mood: v('mood'),
    audioRef: f.audioAsset
      ? { storage: 'cloudkit', url: f.audioAsset.value?.downloadURL }
      : undefined,
    photoRef: f.photoAsset
      ? { storage: 'cloudkit', url: f.photoAsset.value?.downloadURL }
      : undefined,
    reactions,
    createdAt: fromEpochMs(v('createdAt')),
    updatedAt: fromEpochMs(v('updatedAt')),
  }
}

async function blobToCKAsset(blob, filenameHint) {
  // CloudKit JS accepts a File for asset fields. Wrap the blob if it
  // isn't already a File so the SDK reads .name.
  if (typeof File === 'function' && !(blob instanceof File)) {
    return new File([blob], filenameHint, { type: blob.type || 'application/octet-stream' })
  }
  return blob
}

// ─── Trip records ───────────────────────────────────────────────────
//
// Trips always live in the Family zone (every trip is a family trip in
// this app). Owner writes to privateCloudDatabase / Family;
// recipients read from sharedCloudDatabase / Family after accepting the
// share. Whole nested trip object goes in `dataJson` so reads stay
// simple (no joining Days/Stops back together client-side). Typed
// columns alongside (`dateRangeStart`, `dateRangeEnd`, `endCity`) give
// us indexed querying for future "by month" or "by location" browsing
// without touching the read path.

export async function pullTrips() {
  if (!isCloudKitConfigured()) return []
  const container = await getContainer()
  const out = []
  const errors = []
  let privateRawCount = 0
  let privateParsedCount = 0
  // Owner side — privateCloudDatabase Family zone. Same queryable-index
  // caveat as pullAll: performQuery against a custom zone returns empty
  // without an explicit recordName index in the schema. Walk the change
  // feed instead.
  try {
    const priv = container.privateCloudDatabase
    const records = await fetchAllFromSharedZone(priv, TRIP_RECORD_TYPE)
    privateRawCount = records.length
    for (const rec of records) {
      const t = tripFromCKRecord(rec)
      if (t) {
        out.push(t)
        privateParsedCount += 1
      }
    }
    if (privateRawCount > 0 && privateParsedCount === 0) {
      errors.push(`private/family: got ${privateRawCount} raw record(s) but tripFromCKRecord returned null for all (probably missing dataJson field on server)`)
    } else if (privateRawCount === 0) {
      // Zero filtered records. Surface the full zone contents so we can
      // see whether the records are present under a different recordType
      // name vs not present at all.
      const counts = records.zoneCounts || {}
      const summary = Object.keys(counts).length
        ? Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')
        : 'empty'
      errors.push(`private/family: 0 ${TRIP_RECORD_TYPE} records · zone contains: ${summary}`)
    }
  } catch (err) {
    console.warn('CloudKit pullTrips(private) failed', err)
    errors.push(`private/family: ${err?.message || String(err)}`)
  }
  // Recipient side — sharedCloudDatabase (only present after accepting a share).
  // Same Zone-Wide-Query restriction as memories; use fetchRecordZoneChanges.
  try {
    const shared = container.sharedCloudDatabase
    const records = await fetchAllFromSharedZone(shared, TRIP_RECORD_TYPE)
    for (const rec of records) {
      const t = tripFromCKRecord(rec)
      if (t) out.push(t)
    }
  } catch (err) {
    console.warn('CloudKit pullTrips(shared) failed', err)
    errors.push(`shared/family: ${err?.message || String(err)}`)
  }
  // De-duplicate by trip id — owner + recipient might both surface
  // the same trip if the user has accepted their own share (rare but
  // possible in dev).
  const byId = new Map()
  for (const t of out) byId.set(t.id, t)
  const result = Array.from(byId.values())
  if (errors.length) result.errors = errors
  return result
}

export async function pushTrip(trip) {
  if (!isCloudKitConfigured()) return false
  const container = await getContainer()
  await ensureFamilyZone()

  const fields = {}
  // The dashboard auto-capped Memory's tripId → tripID but kept Trip's
  // as tripId (verified in the dashboard schema — inconsistent because
  // the user created Memory and Trip in different sessions). Match
  // each schema as it actually exists on the server, not as we'd
  // prefer it to be.
  put(fields, 'tripId', trip.id)
  put(fields, 'title', trip.title)
  put(fields, 'endCity', trip.endCity)
  put(fields, 'dateRangeStart', trip.dateRangeStart)
  put(fields, 'dateRangeEnd', trip.dateRangeEnd)
  put(fields, 'updatedAt', new Date().toISOString())
  put(fields, 'dataJson', JSON.stringify(trip))
  const record = {
    recordType: TRIP_RECORD_TYPE,
    recordName: `trip_${trip.id}`,
    zoneID: { zoneName: SHARED_ZONE },
    fields,
  }
  // Owner-first; only fall through to recipient side (sharedCloudDatabase)
  // when the privateDB error is the legitimate "you're a recipient, not
  // the owner" case (typically ZONE_NOT_FOUND). For any other error
  // (schema mismatch, validation, auth) re-throw the real reason instead
  // of layering a confusing sharedDB error on top.
  let privErr = null
  try {
    await saveOrUpdate(container.privateCloudDatabase, record)
    return true
  } catch (err) {
    privErr = err
  }
  const looksLikeRecipient = /zone[_ ]not[_ ]found|zonenotfound/i.test(
    privErr?.message || ''
  )
  if (!looksLikeRecipient) {
    console.warn('CloudKit pushTrip(private) failed', privErr)
    throw privErr
  }
  try {
    await saveOrUpdate(container.sharedCloudDatabase, record)
    return true
  } catch (err2) {
    console.warn('CloudKit pushTrip(shared) failed', err2 || privErr)
    throw new Error(
      `priv: ${privErr?.message || 'unknown'} · shared: ${err2?.message || 'unknown'}`
    )
  }
}

export async function deleteTrip(tripId) {
  if (!isCloudKitConfigured()) return false
  const container = await getContainer()
  const ref = { recordName: `trip_${tripId}`, zoneID: { zoneName: SHARED_ZONE } }
  try {
    await container.privateCloudDatabase.deleteRecords([ref])
    return true
  } catch {
    try {
      await container.sharedCloudDatabase.deleteRecords([ref])
      return true
    } catch (err) {
      console.warn('CloudKit deleteTrip failed', err)
      return false
    }
  }
}

function tripFromCKRecord(rec) {
  const f = rec.fields || {}
  const v = (k) => (f[k] ? f[k].value : undefined)
  const json = v('dataJson')
  if (!json) return null
  try {
    const trip = JSON.parse(json)
    if (v('dateRangeStart')) trip.dateRangeStart = v('dateRangeStart')
    if (v('dateRangeEnd')) trip.dateRangeEnd = v('dateRangeEnd')
    if (v('endCity')) trip.endCity = v('endCity')
    return trip
  } catch (err) {
    console.warn('CloudKit tripFromCKRecord JSON parse failed', err)
    return null
  }
}

// ─── Sharing flow ───────────────────────────────────────────────────
//
// Owner: opens Apple's hosted "share with people" UI for the Family
// zone via shareWithUI. Apple handles the invitations (Mail / Messages
// / public link) and the share URL is generated and stored on Apple's
// servers. The owner can re-open the same UI later to add or remove
// participants.
//
// Recipient: taps the iCloud share URL (https://www.icloud.com/share/…)
// in Mail/Messages → Apple's hosted accept page on icloud.com handles
// acceptance. After accepting, the recipient just opens the PWA, signs
// into iCloud, and pullAll surfaces the shared records via
// sharedCloudDatabase. We do not need a programmatic acceptShares call
// in the web flow — Apple's hosted page does the work.
//
// Caveat: shareWithUI opens a popup window. iOS standalone PWAs (apps
// launched from the Home Screen) block these popups, so the owner must
// run shareWithUI in regular Safari, not the home-screen PWA. The
// Settings UI gates the Invite button on standalone-mode detection.

// Pre-warm the container and Family zone so the Invite button can call
// shareWithUI synchronously inside the click handler. Mobile Safari
// (and to a lesser extent desktop Safari) treats any code past an
// `await` as no longer a user gesture and refuses to open popups —
// shareWithUI then sits waiting and eventually returns
// `SHARE_UI_TIMEOUT`. Settings calls this on sign-in; the click
// handler reads the resolved value and calls shareWithUI in the same
// frame as the tap.
let warmedDbP = null
export function prewarmFamilyShare() {
  if (warmedDbP) return warmedDbP
  warmedDbP = (async () => {
    if (!isCloudKitConfigured()) return null
    const container = await getContainer()
    await ensureFamilyZone()
    return container.privateCloudDatabase
  })()
  warmedDbP.catch(() => {
    warmedDbP = null
  })
  return warmedDbP
}

// Synchronous shareWithUI call. Caller must have already awaited
// prewarmFamilyShare() and pass the resolved database in. Throws if
// the SDK doesn't expose shareWithUI in this browser.
export function shareFamilyZoneSync(db) {
  if (!db || typeof db.shareWithUI !== 'function') {
    throw new Error('shareWithUI is not available in this browser')
  }
  return db.shareWithUI({
    zoneID: { zoneName: SHARED_ZONE },
    publicPermission: 'NONE',
  })
}

// Async convenience: full pre-warm + share in one call. Kept for
// non-Safari callers (e.g. desktop Chrome which is more lenient about
// the gesture context). Settings deliberately doesn't use this on
// the click path because of the gesture issue described above.
export async function shareFamilyZoneWithUI() {
  const db = await prewarmFamilyShare()
  if (!db) throw new Error('CloudKit not configured')
  return shareFamilyZoneSync(db)
}

// True when the page is running as an installed PWA (home-screen launch
// in iOS standalone mode, or the equivalent on other platforms). We use
// this to hide the Invite button — shareWithUI opens a popup which iOS
// standalone mode blocks, leaving the user with a "share_ui_timeout"
// error. The owner must run the invite flow in regular Safari.
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch {
    /* older browsers without matchMedia support */
  }
  // Safari iOS exposes a non-standard navigator.standalone for legacy
  // home-screen PWAs.
  if (typeof navigator !== 'undefined' && navigator.standalone === true) {
    return true
  }
  return false
}
