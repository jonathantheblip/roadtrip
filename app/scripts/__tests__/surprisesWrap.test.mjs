// Unit tests for the surprise-composer rebuild's data layer: the wrap pickers
// (real trip data → item shape) + the reveal-label copy fix (author vs recipient).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { revealLabel, wrapItemsForKind, memGlyph, stopGlyph } from '../../src/lib/surprises.js'

const TRIP = {
  id: 't1',
  days: [
    {
      n: 1,
      isoDate: '2026-05-22',
      stops: [
        { id: 's1', name: 'Beach Bungalow', kind: 'lodging', time: 'Evening', lat: 41.3, lng: -72.0 },
        { id: 's2', name: 'No-coords stop', kind: 'sights', time: '9 AM' }, // wrap-to-hide: now INCLUDED (coords no longer required)
        { id: 's3', name: 'Already secret', kind: 'museum', surprise: { author: 'jonathan', hideFrom: ['helen'] } }, // already a surprise → excluded
        { id: 's4', kind: 'walk' }, // no name → excluded
      ],
    },
  ],
}

const MEMS = [
  { id: 'm1', kind: 'photo', caption: 'rafa asleep', stopId: 's1', capturedAt: '2026-05-22T20:10:00Z' },
  { id: 'm2', kind: 'text', text: 'a note for the thread', stopId: 's1' },
  { id: 'm3', kind: 'voice', caption: 'voice memo' },
  { id: 'm4', kind: 'photo', caption: 'already a surprise', hideFrom: ['jonathan'] }, // surprise → excluded
  { id: 'm5', kind: 'photo', caption: 'masked projection', masked: true }, // masked → excluded
]

test('revealLabel — author vs recipient phrasing (manual copy fix)', () => {
  assert.equal(revealLabel({ type: 'manual' }, true), 'until you reveal it')
  assert.equal(revealLabel({ type: 'manual' }, false), "when the moment's right")
  assert.equal(revealLabel(null, true), 'until you reveal it')
  assert.equal(revealLabel({ type: 'arrival', label: 'the Aquarium' }, true), 'when they arrive at the Aquarium')
  assert.equal(revealLabel({ type: 'arrival', label: 'the Aquarium' }, false), 'when you arrive at the Aquarium')
  assert.equal(revealLabel({ type: 'date', at: '2026-06-15' }, true), 'on June 15')
})

test('wrapItemsForKind A photo — only non-surprise, non-masked photo memories', () => {
  const items = wrapItemsForKind('A photo', { memories: MEMS, trip: TRIP })
  assert.deepEqual(items.map((i) => i.id), ['m1']) // m4 (surprise) + m5 (masked) excluded
  assert.equal(items[0].kind, 'photo')
  assert.equal(items[0].icon, '🖼️')
  assert.equal(items[0].title, 'rafa asleep')
  assert.match(items[0].meta, /Beach Bungalow/) // place resolved from stopId
})

test('wrapItemsForKind A memory — note + voice memories', () => {
  const items = wrapItemsForKind('A memory', { memories: MEMS, trip: TRIP })
  assert.deepEqual(items.map((i) => i.id).sort(), ['m2', 'm3'])
  assert.equal(items.find((i) => i.id === 'm2').title, 'a note for the thread')
})

test('wrapItemsForKind A stop — all named non-surprise stops (Slice 2: coords no longer required)', () => {
  const items = wrapItemsForKind('A stop', { trip: TRIP })
  assert.deepEqual(items.map((i) => i.id), ['s1', 's2']) // s3 (already a surprise) + s4 (nameless) excluded
  assert.equal(items[0].title, 'Beach Bungalow')
  assert.equal(items[0].stopId, 's1')
  assert.equal(items[0].dayIso, '2026-05-22') // carries dayIso so create can find the exact stop
  assert.equal(items[1].title, 'No-coords stop')
})

test('empty / missing inputs never throw', () => {
  assert.deepEqual(wrapItemsForKind('A photo', {}), [])
  assert.deepEqual(wrapItemsForKind('A stop', {}), [])
  assert.deepEqual(wrapItemsForKind('A photo', { memories: null, trip: null }), [])
})

test('glyph helpers', () => {
  assert.equal(memGlyph('photo'), '🖼️')
  assert.equal(memGlyph('voice'), '🎙️')
  assert.equal(memGlyph('text'), '✍️')
  assert.equal(stopGlyph('museum'), '🏛️')
  assert.equal(stopGlyph('unknown-kind'), '📍')
})
