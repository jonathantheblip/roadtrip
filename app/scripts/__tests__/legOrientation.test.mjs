// Unit tests for legOrientation (src/lib/legOrientation.js) — the keyless money +
// language facts the per-leg context card shows, and the delta gate that keeps it
// off a domestic leg. Uses Intl.DisplayNames (stable for 'en' in node/browser).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { legOrientation, hasOrientationDelta, FX_AS_OF } from '../../src/lib/legOrientation.js'

test('legOrientation: a leg abroad surfaces money + language + country', () => {
  const o = legOrientation({ currency: 'EUR', locale: 'it-IT' })
  assert.equal(o.currencyCode, 'EUR')
  assert.match(o.currencyName || '', /euro/i)
  assert.equal(o.currencySymbol, '€')
  assert.equal(o.usdHint, '1 EUR ≈ $1.08') // dollar-ish: per-unit reads naturally
  assert.match(o.languageName || '', /italian/i)
  assert.equal(o.greeting, 'Buongiorno')
  assert.match(o.countryName || '', /italy/i)
})

test('legOrientation: a leg in the HOME currency + language shows no delta (empty)', () => {
  assert.deepEqual(legOrientation({ currency: 'USD', locale: 'en-US' }), {})
  assert.equal(hasOrientationDelta({ currency: 'USD', locale: 'en-US' }), false)
})

test('legOrientation: per-axis — a UK leg has a MONEY delta but no LANGUAGE delta', () => {
  const o = legOrientation({ currency: 'GBP', locale: 'en-GB' })
  assert.equal(o.currencyCode, 'GBP') // money differs
  assert.equal(o.usdHint, '1 GBP ≈ $1.27')
  assert.equal(o.languageName, undefined) // English == home → no language row
  assert.match(o.countryName || '', /united kingdom/i)
  assert.equal(hasOrientationDelta(o.currencyCode ? { currency: 'GBP', locale: 'en-GB' } : {}), true)
})

test('legOrientation: an unknown currency shows the code but NO $ hint (honest — no guessed rate)', () => {
  const o = legOrientation({ currency: 'ISK', locale: 'is-IS' }) // krona not in the snapshot
  assert.equal(o.currencyCode, 'ISK')
  assert.equal(o.usdHint, undefined) // not in FX_TO_USD → omitted, not faked
  assert.match(o.languageName || '', /icelandic/i)
})

test('legOrientation: a SMALL-unit currency reads per-DOLLAR, not a meaningless per-unit cent', () => {
  // JPY ≈ $0.0067/yen → "¥1 ≈ $0.01" is unhelpful; the intuitive orientation is
  // "$1 ≈ 149 JPY". Code (not symbol) disambiguates $-family currencies.
  const o = legOrientation({ currency: 'JPY', locale: 'ja-JP' })
  assert.equal(o.usdHint, '$1 ≈ 149 JPY')
  assert.match(o.languageName || '', /japanese/i)
  // MXN shares the "$" symbol → the code keeps it unambiguous.
  assert.equal(legOrientation({ currency: 'MXN', locale: 'es-MX' }).usdHint, '$1 ≈ 18 MXN')
})

test('legOrientation: a language-only delta (currency omitted) still shows language', () => {
  const o = legOrientation({ locale: 'fr-FR' }) // no currency field
  assert.equal(o.currencyCode, undefined)
  assert.match(o.languageName || '', /french/i)
  assert.equal(o.greeting, 'Bonjour')
  assert.equal(hasOrientationDelta({ locale: 'fr-FR' }), true)
})

test('legOrientation + hasOrientationDelta: never throw on empty / null; FX_AS_OF is stated', () => {
  assert.deepEqual(legOrientation({}), {})
  assert.deepEqual(legOrientation(null), {})
  assert.equal(hasOrientationDelta({}), false)
  assert.equal(hasOrientationDelta(null), false)
  assert.match(FX_AS_OF, /2026/) // the snapshot honestly states when it's from
})
