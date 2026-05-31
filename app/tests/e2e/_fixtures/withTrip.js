// Shared test helpers: seed a trip into the in-page cache and disable
// the worker pull so the cache wins. Useful for tests that need to
// assert against a known trip without the live D1 record overwriting
// the seed.

import { resolvePersona } from './persona.js'

export async function seedTripIntoCache(page, tripSeed) {
  // Persona seed honors RT_PERSONA (Phase 2 build-list item 1) and defaults
  // to 'jonathan' when unset, so this fixture's historical behavior — and the
  // visual baselines that depend on it — stay byte-for-byte unchanged.
  const persona = resolvePersona('jonathan')
  await page.addInitScript(({ trip, persona }) => {
    // Hard-reset all roadtrip-related localStorage so production data
    // from a prior session can't leak in. Then seed only what the test
    // wants the app to see.
    const KEYS_TO_CLEAR = [
      'rt_trips_cache_v1',
      'rt_memories_shared_v1',
      'rt_memories_private_jonathan_v1',
      'rt_memories_private_helen_v1',
      'rt_memories_private_aurelia_v1',
      'rt_memories_private_rafa_v1',
    ]
    for (const k of KEYS_TO_CLEAR) localStorage.removeItem(k)
    localStorage.setItem('rt_trips_cache_v1', JSON.stringify([trip]))
    localStorage.setItem('rt_person_v2', persona)
  }, { trip: tripSeed, persona })

  // Suppress every worker endpoint so cold-load pulls + auto-sync
  // can't repopulate state behind the test's back. Tests that need a
  // specific worker response (uploads, /places/nearby, /leave-when)
  // can install a more specific route before this catch-all fires.
  await page.route(
    /roadtrip-sync\.jonathan-d-jackson\.workers\.dev/,
    async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/memories' || url.pathname.startsWith('/memories/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }
      if (url.pathname === '/trips' || url.pathname.startsWith('/trips/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }
      // Any other worker call in M1: 404 silently. Loud failures here
      // would noise the tests for endpoints we're not exercising.
      await route.fulfill({ status: 404, body: '{"error":"not found"}' })
    }
  )
}

export async function seedMemoriesIntoCache(page, memories) {
  // Memories live in localStorage too (rt_memories_shared_v1). Seed
  // them before mount so PhotosView reads them on first render.
  await page.addInitScript((mems) => {
    const SHARED_KEY = 'rt_memories_shared_v1'
    const existing = JSON.parse(localStorage.getItem(SHARED_KEY) || '[]')
    const merged = [
      ...existing.filter((m) => !mems.some((n) => n.id === m.id)),
      ...mems,
    ]
    localStorage.setItem(SHARED_KEY, JSON.stringify(merged))
  }, memories)
}

// A minimal trip with three days and two stops per day. Photo tests
// attach memories against `vb2-3` (Saturday's first match) and `vb3-4`
// (Sunday's first match) so the grouping logic gets exercised.
export const FIXTURE_TRIP = {
  id: 'volleyball-2026',
  status: 'planning',
  title: 'Fun @ the Sun',
  subtitle: 'Test fixture',
  dateRange: 'May 22 – 25, 2026',
  dateRangeStart: '2026-05-22',
  dateRangeEnd: '2026-05-25',
  startCity: 'Belmont, MA',
  endCity: 'Belmont, MA',
  locationLabel: 'New London, CT',
  miles: 220,
  travelers: ['jonathan', 'helen', 'aurelia', 'rafa'],
  overview: 'Test fixture trip for the photos view.',
  homeBase: { lat: 41.3225, lng: -72.0943, label: '41 Lower Boulevard' },
  days: [
    {
      n: 1,
      date: 'Fri May 22',
      isoDate: '2026-05-22',
      title: 'Pickups',
      drive: { from: '', to: '', hours: '', miles: 110 },
      lodging: '',
      stops: [
        {
          id: 'vb1-3',
          time: 'Evening',
          name: 'Beach Bungalow',
          kind: 'lodging',
          for: ['jonathan', 'helen', 'aurelia', 'rafa'],
          note: '',
          address: '41 Lower Boulevard, New London, CT',
          lat: 41.3225,
          lng: -72.0943,
        },
      ],
    },
    {
      n: 2,
      date: 'Sat May 23',
      isoDate: '2026-05-23',
      title: 'Pool play',
      drive: { from: '', to: '', hours: '', miles: 30 },
      lodging: '',
      stops: [
        {
          id: 'vb2-3',
          time: '3:45 PM',
          name: 'vs BEV 13 Empire',
          kind: 'tournament',
          for: ['aurelia', 'jonathan', 'helen'],
          note: '',
          address: 'Court 1, Mohegan Sun',
          lat: 41.4923,
          lng: -72.0934,
        },
      ],
    },
    {
      n: 3,
      date: 'Sun May 24',
      isoDate: '2026-05-24',
      title: 'Round 2 Pool 2',
      drive: { from: '', to: '', hours: '', miles: 30 },
      lodging: '',
      stops: [
        {
          id: 'vb3-4',
          time: '4:00 PM',
          name: 'Match 1 vs Northeast 13.2',
          kind: 'tournament',
          for: ['aurelia', 'jonathan', 'helen'],
          note: '',
          address: 'Court 3, Mohegan Sun',
          lat: 41.4923,
          lng: -72.0934,
        },
      ],
    },
  ],
}

// Tiny 1×1 red PNG, base64 — small enough to embed inline so memory
// fixtures don't need a separate file. Decoded as a data URL it
// renders happily inside <img>.
export const TINY_RED_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9eyf3KsAAAAASUVORK5CYII='
