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

  // Own private memories — privateCloudDatabase _defaultZone
  try {
    const priv = container.privateCloudDatabase
    const r = await priv.performQuery({ recordType: RECORD_TYPE })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'private'))
  } catch (err) {
    console.warn('CloudKit pullAll(private/default) failed', err)
  }

  // Shared memories the user owns — privateCloudDatabase Family zone
  try {
    const priv = container.privateCloudDatabase
    const r = await priv.performQuery({
      recordType: RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'shared'))
  } catch (err) {
    // Family zone not yet created — normal for first-time owner.
    console.warn('CloudKit pullAll(private/family) failed', err)
  }

  // Shared memories another family member owns — sharedCloudDatabase
  // Family zone (only present after accepting a share invitation).
  try {
    const shared = container.sharedCloudDatabase
    const r = await shared.performQuery({
      recordType: RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'shared'))
  } catch (err) {
    // Recipient hasn't accepted a share yet, or no share exists.
    console.warn('CloudKit pullAll(shared/family) failed', err)
  }

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
  // sharedCloudDatabase if this user is a recipient of someone else's
  // Family zone (recipient writes go via sharedCloudDatabase).
  if (isShared) {
    try {
      await container.privateCloudDatabase.saveRecords([record])
      return true
    } catch (err) {
      // Recipients can't write to their own privateCloudDatabase under
      // someone else's zoneID — they get a server error. Try shared.
      try {
        await container.sharedCloudDatabase.saveRecords([record])
        return true
      } catch (err2) {
        console.warn('CloudKit pushMemory(shared) failed', err2 || err)
        return false
      }
    }
  }

  try {
    await container.privateCloudDatabase.saveRecords([record])
    return true
  } catch (err) {
    console.warn('CloudKit pushMemory(private) failed', err)
    return false
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
  put(f, 'tripId', m.tripId)
  put(f, 'stopId', m.stopId)
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
  put(f, 'createdAt', m.createdAt)
  put(f, 'updatedAt', m.updatedAt)
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
    tripId: v('tripId'),
    stopId: v('stopId'),
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
    createdAt: v('createdAt'),
    updatedAt: v('updatedAt'),
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
  // Owner side — privateCloudDatabase
  try {
    const priv = container.privateCloudDatabase
    const r = await priv.performQuery({
      recordType: TRIP_RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (r.records) for (const rec of r.records) {
      const t = tripFromCKRecord(rec)
      if (t) out.push(t)
    }
  } catch (err) {
    console.warn('CloudKit pullTrips(private) failed', err)
  }
  // Recipient side — sharedCloudDatabase (only present after accepting a share)
  try {
    const shared = container.sharedCloudDatabase
    const r = await shared.performQuery({
      recordType: TRIP_RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (r.records) for (const rec of r.records) {
      const t = tripFromCKRecord(rec)
      if (t) out.push(t)
    }
  } catch (err) {
    console.warn('CloudKit pullTrips(shared) failed', err)
  }
  // De-duplicate by trip id — owner + recipient might both surface
  // the same trip if the user has accepted their own share (rare but
  // possible in dev).
  const byId = new Map()
  for (const t of out) byId.set(t.id, t)
  return Array.from(byId.values())
}

export async function pushTrip(trip) {
  if (!isCloudKitConfigured()) return false
  const container = await getContainer()
  await ensureFamilyZone()

  const fields = {}
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
  // Owner-first, fall through to recipient side (sharedCloudDatabase)
  // for participants who write back into the share.
  try {
    await container.privateCloudDatabase.saveRecords([record])
    return true
  } catch {
    try {
      await container.sharedCloudDatabase.saveRecords([record])
      return true
    } catch (err) {
      console.warn('CloudKit pushTrip failed', err)
      return false
    }
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
// zone. Apple handles invitations (Mail / Messages / public link) and
// returns the share URL. Owner sees who's accepted in CloudKit's UI.
//
// Recipient: opens the share URL on their device → it lands them in
// the PWA with `?ck_shareurl=…` → we call acceptShares to bind their
// account to the zone.

export async function shareFamilyZoneWithUI() {
  if (!isCloudKitConfigured()) {
    throw new Error('CloudKit not configured')
  }
  const container = await getContainer()
  await ensureFamilyZone()
  const db = container.privateCloudDatabase
  if (typeof db.shareWithUI !== 'function') {
    throw new Error('CloudKit JS in this browser does not expose shareWithUI')
  }
  // Sharing the zone (vs a specific record) makes every Trip + Memory
  // in the Family zone visible to participants who accept the share.
  return db.shareWithUI({
    zoneID: { zoneName: SHARED_ZONE },
    publicPermission: 'NONE',
  })
}

export async function acceptFamilyShare(shareUrl) {
  if (!isCloudKitConfigured()) {
    throw new Error('CloudKit not configured')
  }
  if (!shareUrl) throw new Error('share URL required')
  const container = await getContainer()
  if (typeof container.acceptShares !== 'function') {
    throw new Error('CloudKit JS in this browser does not expose acceptShares')
  }
  // CloudKit JS's acceptShares takes share metadata, but the simple
  // path is to pass the URL and let the SDK fetch the metadata.
  // Different SDK versions accept either { shareURL } objects or raw
  // strings — try both.
  try {
    return await container.acceptShares([{ shareURL: shareUrl }])
  } catch (err1) {
    try {
      return await container.acceptShares([shareUrl])
    } catch (err2) {
      throw err2 || err1
    }
  }
}
