// O2a — the challenger shadow read (worker/src/healChallenger.js). Asserts the adapter
// faithfully maps worker trip+memory shapes into the engine, the whole ladder runs and
// reads out per photo, the per-decision summary is a compact non-forced pick, and the
// degenerate inputs the caller relies on (empty rows, a stopless day) don't throw.
import { describe, it, expect } from 'vitest'
import {
  parseTimeMin,
  adaptTripStops,
  adaptMemoryRows,
  summarizeReads,
  challengerRead,
  hmForDecision,
} from '../src/healChallenger.js'

const NOW = Date.UTC(2026, 6, 10)

const tripData = () => ({
  id: 't1',
  dateRangeEnd: '2026-07-08',
  days: [
    {
      isoDate: '2026-07-04',
      stops: [
        { id: 'X', name: 'Herring Cove', lat: 42.052, lng: -70.18, time: '2:00 PM' },
        { id: 'Y', name: 'Race Point', lat: 42.05, lng: -70.18, time: '3:00 PM' },
      ],
    },
  ],
})
const rows = () => [
  {
    id: 'm1',
    stop_id: null,
    photo_r2_keys_json: JSON.stringify([
      { key: 'a', capturedAt: '2026-07-04T14:00:00.000Z', offsetMinutes: 0, lat: 42.051, lng: -70.18, prov: { gps: 'exif' }, vision: { placeType: 'beach', signage: 'Herring Cove' } },
      { key: 'b', capturedAt: '2026-07-04T14:03:00.000Z', offsetMinutes: 0, lat: 42.051, lng: -70.18, prov: { gps: 'exif' } },
    ]),
  },
  {
    id: 'm2',
    stop_id: 'X',
    photo_r2_keys_json: JSON.stringify([
      { key: 'f1', capturedAt: '2026-07-04T13:00:00.000Z', offsetMinutes: 0, vision: { placeType: 'beach', signage: 'Herring Cove' } },
    ]),
  },
]

describe('healChallenger — adapters', () => {
  it('parseTimeMin handles meridiem + edges', () => {
    expect(parseTimeMin('2:00 PM')).toBe(14 * 60)
    expect(parseTimeMin('12:00 AM')).toBe(0)
    expect(parseTimeMin('12:30 PM')).toBe(12 * 60 + 30)
    expect(parseTimeMin('09:15')).toBe(9 * 60 + 15)
    expect(parseTimeMin(undefined)).toBe(null)
  })
  it('adaptTripStops parses times and flattens stops', () => {
    const t = adaptTripStops(tripData())
    expect(t.days[0].stops[0].timeMin).toBe(14 * 60)
    expect(t.stops.map((s) => s.id)).toEqual(['X', 'Y'])
    expect(t.endMs).toBe(Date.parse('2026-07-08'))
  })
  it('adaptMemoryRows flattens photos with offset + vision + filing', () => {
    const pts = adaptMemoryRows(rows())
    expect(pts.map((p) => p.id)).toEqual(['a', 'b', 'f1'])
    const a = pts.find((p) => p.id === 'a')
    expect(a.memoryId).toBe('m1')
    expect(a.currentStopId).toBe(null)
    expect(a.signage).toBe('Herring Cove')
    expect(pts.find((p) => p.id === 'f1').currentStopId).toBe('X')
  })
  it('adaptMemoryRows tolerates malformed photo json', () => {
    expect(adaptMemoryRows([{ id: 'x', photo_r2_keys_json: 'not json' }])).toEqual([])
    expect(adaptMemoryRows([{ id: 'x', photo_r2_keys_json: null }])).toEqual([])
  })
})

describe('healChallenger — summarizeReads', () => {
  it('empty → null; otherwise a compact non-forced modal pick', () => {
    expect(summarizeReads([])).toBe(null)
    const s = summarizeReads([
      { top: 'X', topM: 1, destination: 'ask', conflict: 0.9, ignorance: 0 },
      { top: 'X', topM: 0.8, destination: 'ask', conflict: 0.8, ignorance: 0.1 },
      { top: 'Y', topM: 0.6, destination: 'heal', conflict: 0.4, ignorance: 0 },
    ])
    expect(s.top).toBe('X') // modal
    expect(s.dest).toBe('ask') // modal
    expect(s.n).toBe(3)
    expect(s.m).toBeCloseTo(0.9, 5) // mean topM on the modal-top reads (1, 0.8)
  })
})

describe('healChallenger — challengerRead (whole ladder)', () => {
  it('reads every photo through the whole ladder', () => {
    const read = challengerRead({ tripData: tripData(), rows: rows(), now: NOW })
    expect(read.byPhoto.has('a')).toBe(true)
    expect(read.byPhoto.has('b')).toBe(true)
    expect(read.byPhoto.has('f1')).toBe(true)
    // every read carries the settle contract
    const a = read.byPhoto.get('a')
    expect(a).toHaveProperty('destination')
    expect(a).toHaveProperty('top')
    expect(a).toHaveProperty('conflict')
  })
  it('hmForDecision summarises a decision’s OWN photos (keyed on photoIds)', () => {
    const read = challengerRead({ tripData: tripData(), rows: rows(), now: NOW })
    const hm = hmForDecision(read, ['a', 'b'])
    expect(hm.n).toBe(2)
    expect(['X', 'Y']).toContain(hm.top)
    expect(hm.dest).toBeTruthy()
  })
  it('a decision with no matching photos → null summary', () => {
    const read = challengerRead({ tripData: tripData(), rows: rows(), now: NOW })
    expect(hmForDecision(read, ['nonexistent'])).toBe(null)
  })
  it('REGRESSION (O2 review Finding 1): a memory split across days is scoped per-moment', () => {
    // One memory, two photos on two different days → the incumbent makes TWO moments,
    // both listing this memory in memoryIds but each carrying only its own photoId.
    // Keying hm on memoryIds (the bug) would give BOTH moments an n:2 mixed summary;
    // keying on the decision's own photoIds (the fix) scopes each to its day.
    const twoDayTrip = {
      id: 't2',
      dateRangeEnd: '2026-07-08',
      days: [
        { isoDate: '2026-07-04', stops: [{ id: 'X', name: 'Herring Cove', lat: 42.052, lng: -70.18, time: '2:00 PM' }] },
        { isoDate: '2026-07-05', stops: [{ id: 'Z', name: 'Long Point', lat: 42.02, lng: -70.17, time: '2:00 PM' }] },
      ],
    }
    const splitRows = [
      {
        id: 'm-split',
        stop_id: null,
        photo_r2_keys_json: JSON.stringify([
          { key: 'd4', capturedAt: '2026-07-04T14:00:00.000Z', offsetMinutes: 0, lat: 42.052, lng: -70.18, prov: { gps: 'exif' } },
          { key: 'd5', capturedAt: '2026-07-05T14:00:00.000Z', offsetMinutes: 0, lat: 42.02, lng: -70.17, prov: { gps: 'exif' } },
        ]),
      },
    ]
    const read = challengerRead({ tripData: twoDayTrip, rows: splitRows, now: NOW })
    const day4 = hmForDecision(read, ['d4'])
    const day5 = hmForDecision(read, ['d5'])
    expect(day4.n).toBe(1)
    expect(day5.n).toBe(1)
    expect(day4.top).toBe('X')
    expect(day5.top).toBe('Z') // not contaminated by the 07-04 photo
  })
  it('degenerate inputs never throw (the caller’s WHOLE-or-abort depends on this)', () => {
    expect(() => challengerRead({ tripData: tripData(), rows: [], now: NOW })).not.toThrow()
    expect(challengerRead({ tripData: tripData(), rows: [], now: NOW }).byPhoto.size).toBe(0)
    // a day with no stops → those photos are simply not settled (no candidates)
    const noStops = { id: 't', dateRangeEnd: '2026-07-08', days: [{ isoDate: '2026-07-04', stops: [] }] }
    expect(() => challengerRead({ tripData: noStops, rows: rows(), now: NOW })).not.toThrow()
    expect(challengerRead({ tripData: noStops, rows: rows(), now: NOW }).byPhoto.size).toBe(0)
  })
})
