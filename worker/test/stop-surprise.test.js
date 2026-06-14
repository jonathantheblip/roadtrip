// Slice 2 — per-stop masking, the PURE worker mirror + the save-back clobber
// guard (preserveHiddenStops). Pure logic, no D1. The through-the-worker boundary
// (GET /trips, Claude, POST /trips merge, the date cron) is exercised separately
// against a REAL miniflare D1 in stop-surprise-boundary.test.js.
//
// NON-VACUOUS: the leak assertions search the serialized projection for the real
// stop's name/place — drop the mask and they're right there. The merge assertions
// fail loudly if a hidden stop is dropped on write-back (the data-loss bug).
import { describe, it, expect } from 'vitest'
import {
  isStopSurprise,
  isStopMaskedFrom,
  maskTripStops,
  maskTripForViewer,
  preserveHiddenStops,
} from '../src/surprises.js'

const teaserStop = () => ({
  id: 'st-candy', name: "Mo's Candy Emporium", kind: 'browse', time: '3:00 PM',
  address: '12 Sweet St', for: ['rafa'], note: 'the big surprise', lat: 41.49, lng: -72.09,
  surprise: {
    author: 'jonathan', hideFrom: ['rafa'], conceal: 'teaser',
    reveal: { type: 'arrival', at: 'st-candy', label: "Mo's Candy Emporium", lat: 41.49, lng: -72.09 },
  },
})
const coverStop = () => ({
  id: 'st-jewel', name: 'Tiffany (ring pickup)', kind: 'shopping', time: '11:00 AM', address: '727 5th Ave',
  surprise: {
    author: 'jonathan', hideFrom: ['helen'], conceal: 'cover', reveal: { type: 'manual' },
    cover: { icon: '☕', title: 'Coffee at Blue Bottle', loc: 'Bryant Park', time: '11:00 AM', weather: 'cool', packing: 'a jacket' },
  },
})
const plainStop = () => ({ id: 'st-lunch', name: 'Lunch at the deli', kind: 'lunch', time: '1:00 PM' })

const trip = () => ({
  id: 't1',
  days: [
    { isoDate: '2026-05-22', stops: [plainStop(), coverStop()] },
    { isoDate: '2026-05-23', stops: [teaserStop()] },
  ],
})

describe('per-stop masking — pure worker mirror', () => {
  it('author + non-targeted see the real stop (referential stability for author)', () => {
    const t = trip()
    expect(maskTripForViewer(t, 'jonathan')).toBe(t) // author untouched, same ref
    const forHelen = maskTripForViewer(t, 'helen')
    // teaser (hidden from rafa) untouched for helen
    expect(forHelen.days[1].stops[0].name).toBe("Mo's Candy Emporium")
  })

  it('a recipient gets the cover stand-in / teaser stub — the real stop NEVER leaks', () => {
    const forRafa = JSON.stringify(maskTripForViewer(trip(), 'rafa'))
    expect(forRafa).not.toContain('Candy')
    expect(forRafa).not.toContain('Sweet St')
    expect(forRafa).not.toContain('41.49') // arrival coords stripped
    expect(forRafa).toContain("Something's coming")

    const forHelen = JSON.stringify(maskTripForViewer(trip(), 'helen'))
    expect(forHelen).not.toContain('Tiffany')
    expect(forHelen).not.toContain('727 5th Ave')
    expect(forHelen).toContain('Coffee at Blue Bottle') // the cover stands in
  })

  it("'everyone' masks every non-author", () => {
    const t = { id: 't', days: [{ isoDate: 'd', stops: [{ ...coverStop(), surprise: { ...coverStop().surprise, hideFrom: ['everyone'] } }] }] }
    expect(JSON.stringify(maskTripStops(t, 'rafa'))).not.toContain('Tiffany')
    expect(JSON.stringify(maskTripStops(t, 'aurelia'))).not.toContain('Tiffany')
    expect(maskTripStops(t, 'jonathan')).toBe(t) // author still sees it
  })

  it('a revealed stop is visible to everyone', () => {
    const t = { id: 't', days: [{ isoDate: 'd', stops: [{ ...teaserStop(), surprise: { ...teaserStop().surprise, revealed: 'x' } }] }] }
    expect(maskTripForViewer(t, 'rafa').days[0].stops[0].name).toBe("Mo's Candy Emporium")
  })
})

describe('preserveHiddenStops — the save-back clobber guard', () => {
  it('restores a teaser stop a recipient never received (would otherwise be erased)', () => {
    const stored = trip()
    // Rafa's device pulled the masked trip → the teaser day shows the STUB, then
    // rafa edits the trip and saves. His incoming copy has the stub, not the real.
    const incoming = {
      id: 't1',
      days: [
        { isoDate: '2026-05-22', stops: [plainStop(), { id: 'st-jewel', name: 'Tiffany (ring pickup)' }] },
        { isoDate: '2026-05-23', stops: [{ id: 'st-candy', name: "🎁 Something's coming", _teaser: true, masked: true }] },
      ],
    }
    const merged = preserveHiddenStops(stored, incoming, 'rafa')
    const candy = merged[1].stops.find((s) => s.id === 'st-candy')
    expect(candy.name).toBe("Mo's Candy Emporium") // the real stop is BACK
    expect(candy.surprise.hideFrom).toEqual(['rafa']) // masking intact
    // No stub echo left behind.
    expect(merged[1].stops.filter((s) => s.id === 'st-candy').length).toBe(1)
  })

  it('restores a cover stop a recipient wrote back as the cover stand-in', () => {
    const stored = trip()
    const incoming = {
      id: 't1',
      days: [
        { isoDate: '2026-05-22', stops: [plainStop(), { id: 'st-jewel', name: 'Coffee at Blue Bottle', _cover: true, masked: true }] },
        { isoDate: '2026-05-23', stops: [teaserStop()] }, // helen could see the teaser, leave it
      ],
    }
    const merged = preserveHiddenStops(stored, incoming, 'helen')
    const jewel = merged[0].stops.find((s) => s.id === 'st-jewel')
    expect(jewel.name).toBe('Tiffany (ring pickup)') // real restored
    expect(jewel.surprise.cover.title).toBe('Coffee at Blue Bottle') // masking intact
  })

  it('the AUTHOR writing keeps full control — no merge, their edits win', () => {
    const stored = trip()
    // Jonathan reveals the teaser + renames a stop.
    const incoming = {
      id: 't1',
      days: [
        { isoDate: '2026-05-22', stops: [plainStop()] }, // dropped the jewel cover stop on purpose
        { isoDate: '2026-05-23', stops: [{ ...teaserStop(), surprise: { ...teaserStop().surprise, revealed: 'now' } }] },
      ],
    }
    const merged = preserveHiddenStops(stored, incoming, 'jonathan')
    // Author is never masked-from → fast path → exactly their incoming days.
    expect(merged).toBe(incoming.days)
    expect(merged[0].stops.length).toBe(1) // their deletion honored
    expect(merged[1].stops[0].surprise.revealed).toBe('now')
  })

  it('a non-targeted viewer (sees everything) triggers no merge', () => {
    const stored = { id: 't', days: [{ isoDate: 'd', stops: [teaserStop()] }] } // hidden from rafa only
    const incoming = { id: 't', days: [{ isoDate: 'd', stops: [teaserStop()] }] }
    expect(preserveHiddenStops(stored, incoming, 'helen')).toBe(incoming.days) // fast path
  })

  it('recreates the day if the recipient dropped the whole day the secret lived on', () => {
    const stored = trip()
    const incoming = { id: 't1', days: [{ isoDate: '2026-05-22', stops: [plainStop()] }] } // day 2 (the teaser) gone
    const merged = preserveHiddenStops(stored, incoming, 'rafa')
    const day2 = merged.find((d) => d.isoDate === '2026-05-23')
    expect(day2).toBeTruthy()
    expect(day2.stops.find((s) => s.id === 'st-candy').name).toBe("Mo's Candy Emporium")
  })

  it('preserves multiple hidden stops across days', () => {
    const stored = {
      id: 't', days: [
        { isoDate: 'd1', stops: [plainStop(), coverStop()] }, // jewel hidden from helen
        { isoDate: 'd2', stops: [{ ...teaserStop(), surprise: { ...teaserStop().surprise, hideFrom: ['helen'] } }] }, // candy hidden from helen too
      ],
    }
    const incoming = { id: 't', days: [{ isoDate: 'd1', stops: [plainStop()] }, { isoDate: 'd2', stops: [] }] }
    const merged = preserveHiddenStops(stored, incoming, 'helen')
    expect(merged[0].stops.find((s) => s.id === 'st-jewel')).toBeTruthy()
    expect(merged[1].stops.find((s) => s.id === 'st-candy')).toBeTruthy()
  })
})
