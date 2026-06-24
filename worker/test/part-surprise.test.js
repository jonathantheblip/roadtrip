// "Surprises by sentence" Slice 1 — per-PART masking, the pure worker boundary +
// the save-back clobber guard (preserveHiddenParts). Pure logic, no D1.
//
// THE LOAD-BEARING DIFFERENCE FROM A STOP: a surprise part spans DATES, and the
// day-by-day detail lives in the flat trip.days[]. So masking the part is NOT
// enough — the days inside its window must be stripped too, or the secret leaks
// through the day list (and PartsTripView, which derives a part's days by date).
//
// NON-VACUOUS: the leak assertions search the serialized projection for the secret
// part's real title/place AND the stop names on its days — drop the mask and
// they're right there. The merge assertions fail loudly if a hidden part (or its
// days) is dropped on write-back (the surprise-destroyed bug).
import { describe, it, expect } from 'vitest'
import {
  isPartSurprise,
  isPartMaskedFrom,
  isoInPartWindow,
  maskTripParts,
  maskTripForViewer,
  preserveHiddenParts,
} from '../src/surprises.js'

const romePart = () => ({ id: 'p-rome', type: 'city', title: 'Three days in Rome', place: 'Rome', dateStart: '2026-08-01', dateEnd: '2026-08-03' })
// A COVER surprise for Helen — the villa is real; she should see a believable coast stay.
const villaPart = () => ({
  id: 'p-villa', type: 'stay', title: 'Secret cliffside villa, Positano', place: 'Positano',
  dateStart: '2026-08-04', dateEnd: '2026-08-06',
  surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'cover', reveal: { type: 'manual' }, cover: { title: 'A few quiet days on the coast', loc: 'the Amalfi coast' } },
})
// A TEASER surprise for Helen — an anniversary dinner, reveals on the date.
const dinnerPart = () => ({
  id: 'p-gift', type: 'event', title: 'Anniversary dinner at Le Sirenuse', place: 'Positano',
  dateStart: '2026-08-07', dateEnd: '2026-08-07',
  surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'date', at: '2026-08-07' } },
})

const trip = () => ({
  id: 't1',
  parts: [romePart(), villaPart(), dinnerPart()],
  days: [
    { isoDate: '2026-08-01', stops: [{ id: 's1', name: 'Colosseum tour' }] }, // Rome — visible
    { isoDate: '2026-08-05', stops: [{ id: 's2', name: 'Villa pool & cliff views' }] }, // villa window — SECRET
    { isoDate: '2026-08-07', stops: [{ id: 's3', name: 'Le Sirenuse rooftop, 8pm' }] }, // dinner window — SECRET
  ],
})

describe('per-part masking — pure worker boundary', () => {
  it('author + non-targeted see the real parts (referential stability — same ref)', () => {
    const t = trip()
    expect(maskTripForViewer(t, 'jonathan')).toBe(t) // author untouched
    expect(maskTripForViewer(t, 'rafa')).toBe(t) // not hidden from rafa → untouched
    expect(maskTripForViewer(t, 'rafa').parts[1].title).toBe('Secret cliffside villa, Positano')
  })

  it('the recipient NEVER sees the secret part — nor its DAYS (the part + days are one secret)', () => {
    const forHelen = maskTripForViewer(trip(), 'helen')
    const json = JSON.stringify(forHelen)
    // The secret part content is gone.
    expect(json).not.toContain('Secret cliffside villa')
    expect(json).not.toContain('Anniversary dinner')
    expect(json).not.toContain('Le Sirenuse')
    // THE LOAD-BEARING CHECK: the secret DAYS' stop names are gone too.
    expect(json).not.toContain('Villa pool & cliff views')
    expect(json).not.toContain('Le Sirenuse rooftop')
    // The cover stands in; the teaser shows a placeholder.
    expect(json).toContain('A few quiet days on the coast')
    expect(json).toContain("Something's coming")
    // The visible part + its day survive intact.
    expect(json).toContain('Three days in Rome')
    expect(json).toContain('Colosseum tour')
    // Only the one visible day remains (the two secret-window days stripped).
    expect(forHelen.days).toHaveLength(1)
    expect(forHelen.days[0].isoDate).toBe('2026-08-01')
  })

  it("'everyone' masks every non-author; the author still sees it", () => {
    const t = { id: 't', parts: [{ ...villaPart(), surprise: { ...villaPart().surprise, hideFrom: ['everyone'] } }], days: [{ isoDate: '2026-08-05', stops: [{ id: 's', name: 'Villa pool & cliff views' }] }] }
    expect(JSON.stringify(maskTripParts(t, 'rafa'))).not.toContain('Villa pool')
    expect(JSON.stringify(maskTripParts(t, 'aurelia'))).not.toContain('Villa pool')
    expect(maskTripParts(t, 'jonathan')).toBe(t) // author still sees it
  })

  it('a revealed surprise part is visible to everyone (and its days return)', () => {
    const t = { id: 't', parts: [{ ...villaPart(), surprise: { ...villaPart().surprise, revealed: '2026-08-04T00:00:00Z' } }], days: [{ isoDate: '2026-08-05', stops: [{ id: 's', name: 'Villa pool & cliff views' }] }] }
    const forHelen = maskTripForViewer(t, 'helen')
    expect(forHelen.parts[0].title).toBe('Secret cliffside villa, Positano')
    expect(forHelen.days).toHaveLength(1) // the day is NOT stripped once revealed
  })

  it('predicates + window helper', () => {
    expect(isPartSurprise(romePart())).toBe(false)
    expect(isPartSurprise(villaPart())).toBe(true)
    expect(isPartMaskedFrom(villaPart(), 'helen')).toBe(true)
    expect(isPartMaskedFrom(villaPart(), 'jonathan')).toBe(false) // author
    expect(isPartMaskedFrom(villaPart(), 'rafa')).toBe(false) // not targeted
    expect(isoInPartWindow('2026-08-05', villaPart())).toBe(true)
    expect(isoInPartWindow('2026-08-09', villaPart())).toBe(false)
    expect(isoInPartWindow('2026-08-07', dinnerPart())).toBe(true) // single-day (no end)
  })

  it('a legacy trip (no parts) passes through untouched', () => {
    const legacy = { id: 't', days: [{ isoDate: 'd', stops: [{ id: 's', name: 'Lunch' }] }] }
    expect(maskTripParts(legacy, 'helen')).toBe(legacy)
  })
})

describe('preserveHiddenParts — the save-back clobber guard', () => {
  it('restores a hidden part AND its days a recipient wrote back without them', () => {
    const stored = trip()
    // Helen pulled the masked trip (villa = cover stub, dinner = teaser stub, both
    // secret days stripped), edited what she could see, and saved. Her incoming copy
    // has the stubs + only the Rome day.
    const incoming = {
      id: 't1',
      parts: [romePart(), { id: 'p-villa', type: 'stay', title: 'A few quiet days on the coast', _cover: true, masked: true }, { id: 'p-gift', title: "🎁 Something's coming", _teaser: true, masked: true }],
      days: [{ isoDate: '2026-08-01', stops: [{ id: 's1', name: 'Colosseum tour' }] }],
    }
    const { parts, days } = preserveHiddenParts(stored, incoming, 'helen')
    // The real parts are BACK, masking intact, no stub echo.
    const villa = parts.find((p) => p.id === 'p-villa')
    expect(villa.title).toBe('Secret cliffside villa, Positano')
    expect(villa.surprise.hideFrom).toEqual(['helen'])
    expect(parts.filter((p) => p.id === 'p-villa')).toHaveLength(1)
    expect(parts.find((p) => p.id === 'p-gift').title).toBe('Anniversary dinner at Le Sirenuse')
    // The secret DAYS are restored too (would otherwise be erased forever).
    expect(days.find((d) => d.isoDate === '2026-08-05')).toBeTruthy()
    expect(days.find((d) => d.isoDate === '2026-08-07')).toBeTruthy()
    expect(days.find((d) => d.isoDate === '2026-08-01')).toBeTruthy() // her visible edit kept
  })

  it('the author writing keeps full control — fast path, no merge', () => {
    const stored = trip()
    const incoming = { id: 't1', parts: [romePart()], days: [] } // jonathan dropped parts on purpose
    const { parts, days } = preserveHiddenParts(stored, incoming, 'jonathan')
    expect(parts).toBe(incoming.parts) // author never masked-from → nothing restored
    expect(days).toBe(incoming.days)
  })

  it('a non-targeted viewer triggers no merge (fast path)', () => {
    const stored = trip() // hidden from helen only
    const incoming = { id: 't1', parts: [romePart()], days: [] }
    const { parts } = preserveHiddenParts(stored, incoming, 'rafa')
    expect(parts).toBe(incoming.parts)
  })
})

describe('per-part masking — clamped windows + dateless days (server↔client agreement)', () => {
  it('a hidden part with NO dateEnd strips days up to the next part (clamped, like partsWithDays)', () => {
    const t = {
      id: 't',
      parts: [
        { id: 'p1', type: 'flight', title: 'Secret flight', dateStart: '2026-09-01', surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } } }, // NO dateEnd
        { id: 'p2', type: 'city', title: 'Rome', place: 'Rome', dateStart: '2026-09-03', dateEnd: '2026-09-05' },
      ],
      days: [
        { isoDate: '2026-09-01', stops: [{ id: 'a', name: 'SECRET takeoff' }] },
        { isoDate: '2026-09-02', stops: [{ id: 'b', name: 'SECRET layover' }] }, // owned by p1 (clamped to 09-02)
        { isoDate: '2026-09-03', stops: [{ id: 'c', name: 'Colosseum' }] }, // p2 — visible
      ],
    }
    const forHelen = maskTripForViewer(t, 'helen')
    const json = JSON.stringify(forHelen)
    expect(json).not.toContain('SECRET takeoff')
    expect(json).not.toContain('SECRET layover') // the clamped extra day is stripped too (was the leak)
    expect(json).toContain('Colosseum')
    expect(forHelen.days.map((d) => d.isoDate)).toEqual(['2026-09-03'])
  })

  it('a DATELESS day owned by a hidden first part is stripped; kept when the first part is visible', () => {
    const base = {
      id: 't',
      parts: [
        { id: 'p1', type: 'stay', title: 'Secret', dateStart: '2026-09-01', dateEnd: '2026-09-02' },
        { id: 'p2', type: 'city', title: 'Rome', dateStart: '2026-09-03', dateEnd: '2026-09-04' },
      ],
      days: [{ isoDate: null, stops: [{ id: 'x', name: 'DATELESS SECRET' }] }, { isoDate: '2026-09-03', stops: [{ id: 'y', name: 'Colosseum' }] }],
    }
    // First part hidden → the dateless day (owned by the first dated part) is stripped.
    const hiddenFirst = JSON.parse(JSON.stringify(base))
    hiddenFirst.parts[0].surprise = { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } }
    expect(JSON.stringify(maskTripForViewer(hiddenFirst, 'helen'))).not.toContain('DATELESS SECRET')
    // First part VISIBLE (only p2 hidden) → the dateless day belongs to the visible first part → kept.
    const visibleFirst = JSON.parse(JSON.stringify(base))
    visibleFirst.parts[1].surprise = { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } }
    expect(JSON.stringify(maskTripForViewer(visibleFirst, 'helen'))).toContain('DATELESS SECRET')
  })
})

describe('per-part masking — the all-undated composite (Finding 5: server↔client fallback)', () => {
  it('an all-undated composite whose first part is a surprise hides ALL its days (no leak)', () => {
    const t = {
      id: 't',
      parts: [
        { id: 'p1', type: 'stay', title: 'Secret weekend', surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } } }, // NO dates
        { id: 'p2', type: 'city', title: 'Rome' }, // NO dates
      ],
      days: [{ isoDate: null, stops: [{ id: 'a', name: 'SECRET dateless stop' }] }, { isoDate: '2026-09-01', stops: [{ id: 'b', name: 'ALSO SECRET' }] }],
    }
    // No part is dated → every day is owned by part 0 (the surprise). Both must go.
    const forHelen = maskTripForViewer(t, 'helen')
    const json = JSON.stringify(forHelen)
    expect(json).not.toContain('SECRET dateless stop')
    expect(json).not.toContain('ALSO SECRET')
    expect(json).not.toContain('Secret weekend')
    expect(forHelen.days).toHaveLength(0)
    // The author still sees everything.
    expect(maskTripForViewer(t, 'jonathan')).toBe(t)
  })

  it('clobber guard restores an all-undated secret part + its days on save-back', () => {
    const stored = {
      id: 't',
      parts: [{ id: 'p1', type: 'stay', title: 'Secret weekend', surprise: { author: 'jonathan', hideFrom: ['helen'], conceal: 'teaser', reveal: { type: 'manual' } } }],
      days: [{ isoDate: null, stops: [{ id: 'a', name: 'SECRET dateless stop' }] }],
    }
    const incoming = { id: 't', parts: [{ id: 'p1', title: "🎁 Something's coming", _teaser: true, masked: true }], days: [] }
    const { parts, days } = preserveHiddenParts(stored, incoming, 'helen')
    expect(parts.find((p) => p.id === 'p1').title).toBe('Secret weekend')
    expect(days.find((d) => d.stops?.[0]?.name === 'SECRET dateless stop')).toBeTruthy()
  })
})
