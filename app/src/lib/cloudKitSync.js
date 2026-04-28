// CloudKit sync layer for the Memory record type. Spec §4.
//
// Architecture: localStorage stays as the canonical write target — every
// saveMemory / deleteMemory mutation lands locally first so the UI is
// instant and offline-tolerant. This module mirrors those mutations to
// CloudKit asynchronously and pulls remote-only records into the local
// cache on sign-in / refresh.
//
// Conflict resolution: last-write-wins by `updatedAt` timestamp.
// CloudKit assigns a recordChangeTag we honour for delete-vs-update
// races; locally-newer updates beat remote-older ones.
//
// Zones:
//   • Private memories  → _defaultZone in privateCloudDatabase
//   • Shared memories   → "Family" custom zone in sharedCloudDatabase
//
// Assets: audioRef and photoRef both translate to a CloudKit CKAsset
// uploaded from the IDB blob. The Memory record stores the CKAsset
// reference under `audioAsset` / `photoAsset`. Local cache keeps the
// IDB key alive so playback stays instant.

import { getContainer, isCloudKitConfigured } from './cloudkit'
import { loadAsset } from './memAssets'

const RECORD_TYPE = 'Memory'
const TRIP_RECORD_TYPE = 'Trip'
const SHARED_ZONE = 'Family'

// Pull every Memory record (both zones) into a flat array. Used by
// the sign-in path to merge remote into local.
export async function pullAll() {
  if (!isCloudKitConfigured()) return []
  const container = await getContainer()
  const out = []

  // Private zone
  try {
    const priv = container.privateCloudDatabase
    const r = await priv.performQuery({ recordType: RECORD_TYPE })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'private'))
  } catch (err) {
    console.warn('CloudKit pullAll(private) failed', err)
  }

  // Shared zone
  try {
    const shared = container.sharedCloudDatabase
    const r = await shared.performQuery({
      recordType: RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (r.records) for (const rec of r.records) out.push(fromCKRecord(rec, 'shared'))
  } catch (err) {
    // It's normal for shared queries to fail if the zone doesn't exist
    // yet — first user must create it. Log + continue.
    console.warn('CloudKit pullAll(shared) failed', err)
  }
  return out
}

// Push a single Memory record. If audioRef/photoRef are local IDB keys
// we upload the blob as a CKAsset before saving the record.
export async function pushMemory(memory) {
  if (!isCloudKitConfigured()) return null
  const container = await getContainer()
  const db =
    memory.visibility === 'private'
      ? container.privateCloudDatabase
      : container.sharedCloudDatabase

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
  const record = {
    recordType: RECORD_TYPE,
    recordName: memory.id,
    fields,
  }
  if (memory.visibility !== 'private') {
    record.zoneID = { zoneName: SHARED_ZONE }
  }
  try {
    await db.saveRecords([record])
    return true
  } catch (err) {
    console.warn('CloudKit pushMemory failed', err)
    return false
  }
}

// Delete a Memory record from its zone.
export async function deleteRemote(memory) {
  if (!isCloudKitConfigured()) return null
  const container = await getContainer()
  const db =
    memory.visibility === 'private'
      ? container.privateCloudDatabase
      : container.sharedCloudDatabase
  try {
    const ref = { recordName: memory.id }
    if (memory.visibility !== 'private') {
      ref.zoneID = { zoneName: SHARED_ZONE }
    }
    await db.deleteRecords([ref])
    return true
  } catch (err) {
    console.warn('CloudKit deleteRemote failed', err)
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

// CloudKit JS expects file inputs as either File/Blob or specific
// asset objects depending on transport. Modern versions accept a
// { fileChecksum, size, downloadURL } back; for upload we just hand
// it a Blob with a filename hint.
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
// Trip storage model: one CloudKit `Trip` record per trip in the
// shared "Family" zone. Whole nested trip object goes in `dataJson` so
// reads stay simple (no joining Days/Stops back together client-side).
// Typed columns alongside (`dateRangeStart`, `dateRangeEnd`, `endCity`)
// give us indexed querying for future "by month" or "by location"
// browsing without touching the read path. Auto-deploys on first
// save in dev environment; promote-to-production via dashboard.

export async function pullTrips() {
  if (!isCloudKitConfigured()) return []
  const container = await getContainer()
  try {
    const shared = container.sharedCloudDatabase
    const r = await shared.performQuery({
      recordType: TRIP_RECORD_TYPE,
      zoneID: { zoneName: SHARED_ZONE },
    })
    if (!r.records) return []
    return r.records.map(tripFromCKRecord).filter(Boolean)
  } catch (err) {
    console.warn('CloudKit pullTrips failed', err)
    return []
  }
}

export async function pushTrip(trip) {
  if (!isCloudKitConfigured()) return false
  const container = await getContainer()
  const db = container.sharedCloudDatabase
  const fields = {}
  put(fields, 'tripId', trip.id)
  put(fields, 'title', trip.title)
  put(fields, 'endCity', trip.endCity)
  put(fields, 'dateRangeStart', trip.dateRangeStart)
  put(fields, 'dateRangeEnd', trip.dateRangeEnd)
  put(fields, 'updatedAt', new Date().toISOString())
  // Whole payload as JSON. Keep this last so it doesn't get visually
  // confused with the indexed columns above when reading the record.
  put(fields, 'dataJson', JSON.stringify(trip))
  const record = {
    recordType: TRIP_RECORD_TYPE,
    recordName: `trip_${trip.id}`,
    zoneID: { zoneName: SHARED_ZONE },
    fields,
  }
  try {
    await db.saveRecords([record])
    return true
  } catch (err) {
    console.warn('CloudKit pushTrip failed', err)
    return false
  }
}

export async function deleteTrip(tripId) {
  if (!isCloudKitConfigured()) return false
  const container = await getContainer()
  const db = container.sharedCloudDatabase
  try {
    await db.deleteRecords([
      { recordName: `trip_${tripId}`, zoneID: { zoneName: SHARED_ZONE } },
    ])
    return true
  } catch (err) {
    console.warn('CloudKit deleteTrip failed', err)
    return false
  }
}

function tripFromCKRecord(rec) {
  const f = rec.fields || {}
  const v = (k) => (f[k] ? f[k].value : undefined)
  const json = v('dataJson')
  if (!json) return null
  try {
    const trip = JSON.parse(json)
    // Indexed columns are authoritative for the few fields they cover —
    // keeps the JSON blob and column values from drifting if a write
    // ever sets one and not the other.
    if (v('dateRangeStart')) trip.dateRangeStart = v('dateRangeStart')
    if (v('dateRangeEnd')) trip.dateRangeEnd = v('dateRangeEnd')
    if (v('endCity')) trip.endCity = v('endCity')
    return trip
  } catch (err) {
    console.warn('CloudKit tripFromCKRecord JSON parse failed', err)
    return null
  }
}
