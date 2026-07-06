// PARITY: the worker's dayStopIds mirror vs the client original.
//
// worker/src/dayStopIds.js mirrors app/src/lib/photoMatch.js (dayStopIds +
// implicit-base gates) and the app/src/lib/tripShape.js helpers those gates
// ride on. The surprises.js mirrored-lib precedent had no parity test; this
// one does: BOTH copies run over one fixture corpus and must produce
// IDENTICAL per-day id sets. If either side changes semantics, this file goes
// red before the two can drift apart in production.
//
// The client import is safe here: photoMatch.js's static chain is plain .js
// (photoBackfill.js → exifRead.js, whose exifreader dependency is a DYNAMIC
// import inside a function no pure helper calls; tripShape.js imports
// nothing), so vitest bundles it without touching app-only dependencies.
//
// NON-VACUOUS: beyond client===worker equality, each case pins WHICH days
// carry the implicit-base id (`baseDays`) — so both copies can't be
// identically wrong about the gates. The tripImplicitBase TEMPLATE
// (name/lat/lng) is cross-checked on every case too — inert for today's
// id-set consumers, load-bearing for the future resolver's labels/coords.
//
// EXTEND THE CORPUS: add a `{ name, trip, baseDays }` entry. `baseDays` lists
// the isoDates whose id set must include `__trip_base__:<iso>`; every day's
// planned stop ids are always expected. An optional `template` field pins the
// expected implicit-base template (null, or a {name,lat,lng} subset) against
// BOTH copies, for cases where drifting in unison is plausible.
import { describe, it, expect } from 'vitest'
import {
  dayStopIds as clientDayStopIds,
  implicitBaseIdForDay as clientBaseId,
  tripImplicitBase as clientImplicitBase,
} from '../../app/src/lib/photoMatch.js'
import {
  dayStopIds as workerDayStopIds,
  implicitBaseIdForDay as workerBaseId,
  tripImplicitBase as workerImplicitBase,
} from '../src/dayStopIds.js'

const CORPUS = [
  {
    name: 'located-lodging stay (geocoded lodging address, no homeBase)',
    trip: {
      id: 'p1',
      lodging: { name: 'The cabin', address: '613 Forest Mountain Rd, Peru, VT', lat: 43.24, lng: -72.9 },
      days: [
        { isoDate: '2026-07-01', stops: [{ id: 'a1' }, { id: 'a2' }] },
        { isoDate: '2026-07-02', stops: [] },
      ],
    },
    baseDays: ['2026-07-01', '2026-07-02'],
  },
  {
    name: 'homeBase-coords stay (legacy string lodging name)',
    trip: {
      id: 'p2',
      homeBase: { lat: 42.05, lng: -70.18, label: '690 Commercial St, Provincetown, MA' },
      lodging: 'Beach house',
      days: [
        { isoDate: '2026-07-10', stops: [{ id: 'b1' }] },
        { isoDate: '2026-07-11', stops: [{ id: 'b2' }] },
      ],
    },
    baseDays: ['2026-07-10', '2026-07-11'],
  },
  {
    name: 'planned located base stop — Phase 1 owns it, implicit base must be null',
    trip: {
      id: 'p3',
      days: [
        { isoDate: '2026-07-20', stops: [{ id: 'lodge', kind: 'lodging', name: 'The Lodge', lat: 44.1, lng: -71.7 }, { id: 'c1' }] },
        { isoDate: '2026-07-21', stops: [{ id: 'c2' }] },
      ],
    },
    baseDays: [],
  },
  {
    name: 'route trip (2+ overnight bases) — never an implicit base, even with a homeBase anchor',
    trip: {
      id: 'p4',
      homeBase: { lat: 42.4, lng: -71.2, label: 'Home' },
      days: [
        { isoDate: '2026-08-01', lodging: 'Motel A', stops: [{ id: 'd1' }] },
        { isoDate: '2026-08-02', lodging: 'Motel B', stops: [{ id: 'd2' }] },
      ],
    },
    baseDays: [],
  },
  {
    name: 'explicit shape:route with a homeBase anchor — the bulletproof shape gate',
    trip: {
      id: 'p5',
      shape: 'route',
      homeBase: { lat: 42.4, lng: -71.2, label: 'Home' },
      lodging: { name: 'Somewhere' },
      days: [{ isoDate: '2026-08-10', stops: [{ id: 'e1' }] }, { isoDate: '2026-08-11', stops: [] }],
    },
    baseDays: [],
  },
  {
    name: 'single-day unnamed stay — no stay signal, implicit base must be null',
    trip: {
      id: 'p6',
      homeBase: { lat: 41.9, lng: -87.6, label: '41 Lower Boulevard' },
      days: [{ isoDate: '2026-09-01', stops: [{ id: 'f1' }] }],
    },
    baseDays: [],
  },
  {
    name: 'multi-day named stay (homeBase coords + named lodging, no lodging coords)',
    trip: {
      id: 'p7',
      homeBase: { lat: 43.24, lng: -72.9, label: '41 Lower Boulevard, Peru, VT' },
      lodging: { name: 'Grandma’s' },
      days: [
        { isoDate: '2026-09-10', stops: [{ id: 'g1' }] },
        { isoDate: '2026-09-11', stops: [{ id: 'g2' }, { id: 'g3' }] },
      ],
    },
    baseDays: ['2026-09-10', '2026-09-11'],
  },
  {
    name: 'home-day suppression — the "home" night never becomes a photo place',
    trip: {
      id: 'p8',
      homeBase: { lat: 43.24, lng: -72.9, label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2026-09-20', stops: [{ id: 'h1' }] },
        { isoDate: '2026-09-21', lodging: '(home)', stops: [{ id: 'h2' }] },
      ],
    },
    baseDays: ['2026-09-20'],
  },
  {
    name: 'located lodging stop opted OUT of base-ness (isBase:false) — coords without a planned base',
    trip: {
      id: 'p9',
      days: [
        { isoDate: '2026-10-01', stops: [{ id: 'inn', kind: 'lodging', isBase: false, name: 'One-night inn', lat: 40.7, lng: -74.0 }] },
        { isoDate: '2026-10-02', stops: [{ id: 'i1' }] },
      ],
    },
    baseDays: ['2026-10-01', '2026-10-02'],
  },
  {
    name: 'destination-only stay, located later (address in endCity, coords geocoded onto trip.lodging)',
    trip: {
      id: 'p10',
      startCity: 'Belmont, MA',
      endCity: 'Peru, VT',
      lodging: { lat: 43.24, lng: -72.9 },
      days: [
        { isoDate: '2026-10-10', stops: [{ id: 'j1' }] },
        { isoDate: '2026-10-11', stops: [] },
      ],
    },
    baseDays: ['2026-10-10', '2026-10-11'],
  },

  // ── Adversarial corpus (2026-07-05 review) — weird-but-real shapes ────────
  {
    name: 'composite trip (parts present) with flat days — parts never affect the id sets',
    trip: {
      id: 'q1',
      parts: [
        { id: 'pt1', type: 'flight', dateStart: '2026-11-01', dateEnd: '2026-11-01' },
        { id: 'pt2', type: 'stay', dateStart: '2026-11-01', dateEnd: '2026-11-03' },
      ],
      homeBase: { lat: 28.4, lng: -81.5, label: 'Resort Way, Orlando, FL' },
      lodging: { name: 'The resort' },
      days: [
        { isoDate: '2026-11-01', stops: [{ id: 'k1' }] },
        { isoDate: '2026-11-02', stops: [{ id: 'k2' }] },
      ],
    },
    baseDays: ['2026-11-01', '2026-11-02'],
    template: { name: 'The resort', lat: 28.4, lng: -81.5 },
  },
  {
    name: 'a day missing isoDate gets planned ids only (no dateless base id); other days unaffected',
    trip: {
      id: 'q2',
      homeBase: { lat: 43.24, lng: -72.9, label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2026-11-10', stops: [{ id: 'l1' }] },
        { stops: [{ id: 'l2' }] }, // isoDate lost upstream
      ],
    },
    baseDays: ['2026-11-10'],
  },
  {
    name: 'per-day lodging notes + drive records — one distinct base is a stay; drives don\'t reroute it',
    trip: {
      id: 'q3',
      homeBase: { lat: 43.24, lng: -72.9, label: '613 Forest Mountain Rd, Peru, VT' },
      days: [
        { isoDate: '2026-11-20', lodging: 'The cabin', drive: { from: 'Belmont, MA', to: 'Peru, VT' }, stops: [{ id: 'n1' }] },
        { isoDate: '2026-11-21', lodging: 'The cabin', drive: { from: 'Peru, VT', to: 'Belmont, MA' }, stops: [] },
      ],
    },
    baseDays: ['2026-11-20', '2026-11-21'],
    // No trip-level lodging → the label falls back to the anchor's first
    // address segment, exactly as the client renders it.
    template: { name: '613 Forest Mountain Rd', lat: 43.24, lng: -72.9 },
  },
  {
    name: 'trip lodging literally "(home)" + homeBase coords, single day — never a base at your own house',
    trip: {
      id: 'q4',
      homeBase: { lat: 42.4, lng: -71.18, label: '12 Oak St, Belmont, MA' },
      lodging: '(home)',
      days: [{ isoDate: '2026-11-25', stops: [{ id: 'o1' }] }],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'garbage endCity ("Suite 500") is not a destination — stays a route, no base',
    trip: {
      id: 'q5',
      startCity: 'Belmont, MA',
      endCity: 'Suite 500',
      days: [
        { isoDate: '2026-12-01', stops: [{ id: 'r1' }] },
        { isoDate: '2026-12-02', stops: [{ id: 'r2' }] },
      ],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'an isoDate carrying a time suffix is used verbatim — neither copy may quietly normalize it',
    trip: {
      id: 'q6',
      homeBase: { lat: 43.24, lng: -72.9, label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2026-12-05T09:30:00.000Z', stops: [{ id: 't1' }] },
        { isoDate: '2026-12-06', stops: [] },
      ],
    },
    baseDays: ['2026-12-05T09:30:00.000Z', '2026-12-06'],
  },
  {
    name: 'string coords in homeBase are not coords (Number.isFinite, no coercion) — no base',
    trip: {
      id: 'q7',
      homeBase: { lat: '43.24', lng: '-72.9', label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2026-12-10', stops: [{ id: 'u1' }] },
        { isoDate: '2026-12-11', stops: [] },
      ],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'homeBase coords outrank a located isBase:false lodging stop (source priority in the template)',
    trip: {
      id: 'q8',
      homeBase: { lat: 42.05, lng: -70.18, label: '690 Commercial St, Provincetown, MA' },
      lodging: { name: 'Beach house' },
      days: [
        { isoDate: '2026-12-15', stops: [{ id: 'inn2', kind: 'lodging', isBase: false, name: 'Overflow inn', lat: 41.0, lng: -70.0 }] },
        { isoDate: '2026-12-16', stops: [] },
      ],
    },
    baseDays: ['2026-12-15', '2026-12-16'],
    // The template must carry the homeBase anchor, NOT the opted-out inn's
    // coords — the one case where the stayPlaceCoords source order shows.
    template: { name: 'Beach house', lat: 42.05, lng: -70.18 },
  },
  {
    name: 'id-less stops survive: the undefined id rides along identically in both copies',
    trip: {
      id: 'q9',
      homeBase: { lat: 43.24, lng: -72.9, label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2026-12-20', stops: [{ name: 'Beach walk' }, { id: 'v1' }] },
        { isoDate: '2026-12-21', stops: [] },
      ],
    },
    baseDays: ['2026-12-20', '2026-12-21'],
  },
  {
    name: 'drives through 2+ away places defeat the destination-only stay — route despite lodging coords',
    trip: {
      id: 'q10',
      startCity: 'Belmont, MA',
      endCity: 'Portland, ME',
      lodging: { lat: 43.66, lng: -70.25 },
      days: [
        { isoDate: '2026-12-26', drive: { from: 'Belmont, MA', to: 'Portland, ME' }, stops: [{ id: 'w1' }] },
        { isoDate: '2026-12-27', drive: { from: 'Portland, ME', to: 'Freeport, ME' }, stops: [] },
      ],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'located stops spread >60mi defeat the destination-only stay — route, no base',
    trip: {
      id: 'q11',
      startCity: 'Belmont, MA',
      endCity: 'Bar Harbor, ME',
      lodging: { lat: 44.39, lng: -68.2 },
      days: [
        { isoDate: '2027-01-02', stops: [{ id: 'x1', lat: 42.36, lng: -71.06 }] },
        { isoDate: '2027-01-03', stops: [{ id: 'x2', lat: 44.39, lng: -68.2 }] },
      ],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'explicit shape:stay with no coords anywhere — shape alone cannot conjure a base',
    trip: {
      id: 'q12',
      shape: 'stay',
      lodging: 'The cabin',
      days: [
        { isoDate: '2027-01-10', stops: [{ id: 'y1' }] },
        { isoDate: '2027-01-11', stops: [] },
      ],
    },
    baseDays: [],
    template: null,
  },
  {
    name: 'a located planned base stop suppresses the implicit base even when every other signal fires',
    trip: {
      id: 'q13',
      homeBase: { lat: 43.24, lng: -72.9, label: 'Cabin Rd' },
      lodging: { name: 'The cabin' },
      days: [
        { isoDate: '2027-01-20', stops: [{ id: 'z1' }] },
        { isoDate: '2027-01-21', stops: [{ id: 'cabin-stop', kind: 'lodging', name: 'The cabin', lat: 43.24, lng: -72.9 }] },
      ],
    },
    baseDays: [],
    template: null,
  },
]

describe('dayStopIds parity — client photoMatch vs worker mirror', () => {
  it('the two implicit-base id builders agree', () => {
    expect(workerBaseId('2026-07-01')).toBe(clientBaseId('2026-07-01'))
  })

  for (const { name, trip, baseDays, template } of CORPUS) {
    it(name, () => {
      // The implicit-base TEMPLATE must agree between the copies on every
      // case (name/lat/lng ride into the future resolver's labels/coords);
      // rows carrying `template` additionally pin the expected values, so
      // the two copies can't drift in unison on the sharp cases.
      const clientTpl = clientImplicitBase(trip)
      const workerTpl = workerImplicitBase(trip)
      expect(workerTpl).toEqual(clientTpl)
      if (template !== undefined) {
        if (template === null) expect(clientTpl).toBe(null)
        else expect(clientTpl).toMatchObject(template)
      }

      for (const day of trip.days) {
        const client = [...clientDayStopIds(trip, day)].sort()
        const worker = [...workerDayStopIds(trip, day)].sort()
        expect(worker).toEqual(client)

        // Pin the expected shape too, so both copies can't drift together:
        // planned ids always present; the implicit id exactly on baseDays.
        const expected = (day.stops || []).map((s) => s.id)
        if (baseDays.includes(day.isoDate)) expected.push(clientBaseId(day.isoDate))
        expect(client).toEqual(expected.sort())
      }
    })
  }
})
