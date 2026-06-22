// sunTimes.js — sunrise / sunset / golden-hour for a place, on a date.
//
// FAMILY_TRIPS_VISION / the hangout design: the "We could…" conditions strip
// shows the day's light ("GOLDEN 7:32 · SUNSET 7:52"). That's a FREE on-device
// calculation (no weather API) — just astronomy. This is a compact transcription
// of the well-known SunCalc algorithm (Vladimir Agafonkin, BSD-2-Clause): the
// solar position math is standard and verifiable against published almanac times.
//
// Returns Date objects in UTC; format with toLocaleTimeString for the device's
// local time (≈ the place's local time when the family is actually there).
// Pure — no globals beyond Math/Date(ms) (no argless `new Date()`).

const rad = Math.PI / 180
const dayMs = 86400000
const J1970 = 2440588
const J2000 = 2451545

function toJulian(date) {
  return date.valueOf() / dayMs - 0.5 + J1970
}
function fromJulian(j) {
  return new Date((j + 0.5 - J1970) * dayMs)
}
function toDays(date) {
  return toJulian(date) - J2000
}

const e = rad * 23.4397 // obliquity of the Earth

function solarMeanAnomaly(d) {
  return rad * (357.5291 + 0.98560028 * d)
}
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const P = rad * 102.9372 // perihelion of the Earth
  return M + C + P + Math.PI
}
function declination(l) {
  return Math.asin(Math.sin(e) * Math.sin(l)) // latitude term b = 0
}

const J0 = 0.0009
function julianCycle(d, lw) {
  return Math.round(d - J0 - lw / (2 * Math.PI))
}
function approxTransit(Ht, lw, n) {
  return J0 + (Ht + lw) / (2 * Math.PI) + n
}
function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
}
function hourAngle(h, phi, d) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))
}
// Julian date the sun reaches altitude h on the descending (set) side.
function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec)
  const a = approxTransit(w, lw, n)
  return solarTransitJ(a, M, L)
}

// Altitudes (degrees) marking each moment: the horizon (with refraction) for
// rise/set, +6° for the start of the evening golden hour.
const H_HORIZON = -0.833 * rad
const H_GOLDEN = 6 * rad

// → { sunrise, sunset, goldenHour } as UTC Dates, or all null at extreme
// latitudes where the sun doesn't cross the altitude (polar day/night → acos NaN).
export function sunTimes(date, lat, lng) {
  if (!(date instanceof Date) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { sunrise: null, sunset: null, goldenHour: null }
  }
  const lw = rad * -lng
  const phi = rad * lat
  const d = toDays(date)
  const n = julianCycle(d, lw)
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L)
  const Jnoon = solarTransitJ(ds, M, L)

  const Jset = getSetJ(H_HORIZON, lw, phi, dec, n, M, L)
  if (!Number.isFinite(Jset)) return { sunrise: null, sunset: null, goldenHour: null }
  const Jrise = Jnoon - (Jset - Jnoon) // sunrise mirrors sunset about solar noon
  const Jgolden = getSetJ(H_GOLDEN, lw, phi, dec, n, M, L) // sun descends to 6° → golden hour starts

  return {
    sunrise: fromJulian(Jrise),
    sunset: fromJulian(Jset),
    goldenHour: Number.isFinite(Jgolden) ? fromJulian(Jgolden) : null,
  }
}
