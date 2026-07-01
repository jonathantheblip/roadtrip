// legOrientation.js — the honest, keyless "what's different here" facts a current
// leg carries once a trip crosses a border: its MONEY (currency + an APPROXIMATE
// $ hint) and its LANGUAGE (name + a greeting). Derived purely from the leg's
// stored `currency`/`locale` (the concierge stamps them only for a leg that
// crosses a zone/currency/language boundary — see the worker create_trip prompt +
// cardToTrip; a domestic leg carries none, so this returns an empty orientation
// and the context card never mounts: "no delta → no module", Design 05).
//
// The TIME axis is the dual clock's job (localDate + LivingHeartHome), not this —
// this module is money + language only. Pure: no network, no key, no globals
// beyond Intl. Never throws.

// A small CACHED exchange snapshot → USD (the family's home currency). It is
// APPROXIMATE and DATED on purpose (G6): the UI shows it only with a "≈" and the
// as-of note, never as a live/precise rate. A currency not in the table simply
// shows no $ hint (honest — we don't guess a rate we don't have). Refresh
// occasionally; "roughly this many dollars" is all it's for.
export const FX_AS_OF = 'mid-2026'
const HOME_CURRENCY = 'USD'
const FX_TO_USD = {
  EUR: 1.08, GBP: 1.27, CHF: 1.11, CAD: 0.73, AUD: 0.66, NZD: 0.61,
  JPY: 0.0067, MXN: 0.055, SEK: 0.095, NOK: 0.093, DKK: 0.145,
  CNY: 0.14, INR: 0.012, BRL: 0.18, ZAR: 0.055, THB: 0.028, SGD: 0.74,
}

// A friendly greeting per language (BCP-47 primary subtag). Small + honest — a
// language not here just omits the greeting (the language NAME still shows).
const GREETINGS = {
  it: 'Buongiorno', fr: 'Bonjour', es: 'Hola', de: 'Guten Tag', pt: 'Olá',
  nl: 'Hallo', sv: 'Hej', no: 'Hei', da: 'Hej', el: 'Γειά σου', ja: 'こんにちは',
  zh: '你好', ko: '안녕하세요', th: 'สวัสดี', hi: 'नमस्ते', ru: 'Здравствуйте',
}

function displayName(type, value, locale = 'en') {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type }).of(value) || ''
  } catch {
    return ''
  }
}

// The narrow currency symbol ("€", "£", "¥"), or the code itself as a fallback.
function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value || code
  } catch {
    return code
  }
}

// A ROUGH $ conversion, oriented for a US traveler's intuition and honest about
// magnitude: a dollar-ish currency reads "1 EUR ≈ $1.08"; a SMALL-unit currency
// reads per-DOLLAR ("$1 ≈ 149 JPY") instead of a near-meaningless per-unit cent
// ("¥1 ≈ $0.01"). Uses the ISO code (unambiguous — CAD/AUD/MXN/NZD all share the
// "$" symbol). '' when there's no cached rate → no hint shown, never a guess.
function usdHint(code, rate) {
  if (!Number.isFinite(rate) || rate <= 0) return ''
  if (rate >= 0.5) return `1 ${code} ≈ $${rate.toFixed(2)}`
  return `$1 ≈ ${Math.round(1 / rate)} ${code}`
}

// The MONEY + LANGUAGE orientation for a leg, relative to a US/English home.
// Returns only the axes that ACTUALLY differ from home (a foreign currency; a
// non-English language) — so a leg abroad that happens to use USD/English shows
// nothing on that axis. `{ }` (empty) when the leg carries neither (a domestic
// leg, or a pre-keystone trip with no fields). Pure.
export function legOrientation(leg, { homeCurrency = HOME_CURRENCY, homeLanguage = 'en' } = {}) {
  const currency = typeof leg?.currency === 'string' ? leg.currency.trim().toUpperCase() : ''
  const locale = typeof leg?.locale === 'string' ? leg.locale.trim() : ''
  const lang = locale.split('-')[0].toLowerCase()
  const out = {}

  if (currency && currency !== homeCurrency) {
    out.currencyCode = currency
    out.currencyName = displayName('currency', currency) // "Euro"
    out.currencySymbol = currencySymbol(currency) // "€"
    const hint = usdHint(currency, FX_TO_USD[currency])
    if (hint) out.usdHint = hint // "1 EUR ≈ $1.08" | "$1 ≈ 149 JPY"
  }

  if (lang && lang !== homeLanguage) {
    out.languageName = displayName('language', lang) // "Italian"
    out.greeting = GREETINGS[lang] || ''
  }

  // Country is CONTEXT for a delta (labels the money/language), never shown on
  // its own — a leg in a different country but the SAME currency + language as
  // home has no delta and mounts no card ("no delta → no module", 05).
  if (out.currencyCode || out.languageName) {
    const region = locale.split('-')[1]
    if (region) out.countryName = displayName('region', region.toUpperCase()) // "Italy"
  }
  return out
}

// Does the leg carry a real money OR language delta from home? The context card's
// mount gate (with the composite/leg checks the caller adds). False for a domestic
// leg or a leg with no fields → the card never mounts.
export function hasOrientationDelta(leg, opts) {
  const o = legOrientation(leg, opts)
  return !!(o.currencyCode || o.languageName)
}
