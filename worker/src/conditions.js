// "Real conditions" (slice 7) — the pure helpers behind the worker's /conditions
// proxy. Turns Open-Meteo's forecast + marine responses into a small, honest
// conditions object the "We could…" tray reads to re-rank ideas (rain pushes
// outdoor down, heat floats cool/water up, cold closes summer-only spots) and to
// fill the conditions strip. Pure (no fetch / no env), so it unit-tests directly.
//
// Open-Meteo needs NO API key (so no new secret), is free, and is global. Tide
// rides on the Marine API's sea_level_height_msl, which is null INLAND — so a
// place with no coast simply has no tide (the design's "never show tide in
// Chicago" falls out of the data, no coastline table needed).

// WMO weather code → a friendly label, an icon, and a coarse `kind` the re-rank
// keys off. (https://open-meteo.com/en/docs — WW interpretation codes.)
const WMO = {
  0: ['Clear', '☀️', 'clear'],
  1: ['Mostly clear', '🌤️', 'clear'],
  2: ['Partly cloudy', '⛅', 'cloud'],
  3: ['Overcast', '☁️', 'cloud'],
  45: ['Fog', '🌫️', 'fog'],
  48: ['Freezing fog', '🌫️', 'fog'],
  51: ['Light drizzle', '🌦️', 'rain'],
  53: ['Drizzle', '🌦️', 'rain'],
  55: ['Heavy drizzle', '🌧️', 'rain'],
  56: ['Freezing drizzle', '🌧️', 'rain'],
  57: ['Freezing drizzle', '🌧️', 'rain'],
  61: ['Light rain', '🌦️', 'rain'],
  63: ['Rain', '🌧️', 'rain'],
  65: ['Heavy rain', '🌧️', 'rain'],
  66: ['Freezing rain', '🌧️', 'rain'],
  67: ['Freezing rain', '🌧️', 'rain'],
  71: ['Light snow', '🌨️', 'snow'],
  73: ['Snow', '🌨️', 'snow'],
  75: ['Heavy snow', '❄️', 'snow'],
  77: ['Snow grains', '🌨️', 'snow'],
  80: ['Showers', '🌦️', 'rain'],
  81: ['Showers', '🌧️', 'rain'],
  82: ['Heavy showers', '🌧️', 'rain'],
  85: ['Snow showers', '🌨️', 'snow'],
  86: ['Snow showers', '❄️', 'snow'],
  95: ['Thunderstorm', '⛈️', 'storm'],
  96: ['Thunderstorm', '⛈️', 'storm'],
  99: ['Thunderstorm', '⛈️', 'storm'],
}

export function describeCode(code) {
  const [label, icon, kind] = WMO[code] || ['—', '🌡️', 'cloud']
  return { label, icon, kind }
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Open-Meteo forecast URL. Fahrenheit + auto timezone (so daily sunrise/sunset and
// the day boundary are local to the PLACE, not the worker).
export function forecastUrl(lat, lng) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code,precipitation,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '1',
  })
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`
}

// Marine URL — the hourly sea-level series (tide) + the current height. Inland
// points return null values (→ no tide), which is exactly what we want.
export function marineUrl(lat, lng) {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'sea_level_height_msl',
    hourly: 'sea_level_height_msl',
    timezone: 'auto',
    forecast_days: '2',
  })
  return `https://marine-api.open-meteo.com/v1/marine?${p.toString()}`
}

// Normalize the forecast JSON → { tempF, code, label, icon, kind, precipProbPct,
// hiF, loF }. Returns null if the payload is unusable (→ the tray just won't
// re-rank; the client degrades quietly).
export function normalizeForecast(json) {
  const cur = json?.current
  if (!cur || num(cur.temperature_2m) === null) return null
  const code = num(cur.weather_code) ?? 3
  const d = json?.daily || {}
  const at = (arr) => (Array.isArray(arr) ? arr[0] : undefined)
  const desc = describeCode(code)
  return {
    tempF: Math.round(cur.temperature_2m),
    code,
    label: desc.label,
    icon: desc.icon,
    kind: desc.kind, // clear | cloud | rain | snow | storm | fog
    windMph: num(cur.wind_speed_10m),
    precipProbPct: num(at(d.precipitation_probability_max)),
    hiF: num(at(d.temperature_2m_max)) != null ? Math.round(at(d.temperature_2m_max)) : null,
    loF: num(at(d.temperature_2m_min)) != null ? Math.round(at(d.temperature_2m_min)) : null,
    sunrise: at(d.sunrise) || null,
    sunset: at(d.sunset) || null,
  }
}

// Derive tide from the marine hourly series. Returns
//   { state:'rising'|'falling', heightM, next:{ type:'high'|'low', at } } | null
// null when the point has no sea data (inland) — the hinge that keeps tide off a
// landlocked trip. Works in the series' own (local-ISO) index space, so the `at`
// it returns is already a local time string the client formats directly — no
// timezone math. Finds the next turning point (slope sign flip) after "now".
export function deriveTide(marine, nowMs) {
  const heights = marine?.hourly?.sea_level_height_msl
  const times = marine?.hourly?.time
  if (!Array.isArray(heights) || !Array.isArray(times)) return null
  if (!heights.some((v) => num(v) !== null)) return null // inland → all null

  // Open-Meteo times are the place's LOCAL wall clock (no offset suffix). Convert
  // epoch-now into the same local frame via the response's utc_offset_seconds, so
  // ">= now" compares like-for-like regardless of the place's timezone.
  const off = num(marine?.utc_offset_seconds) ?? 0
  const localNowIso = new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + off * 1000)
    .toISOString()
    .slice(0, 16)
  // Start at the first hour at/after now. If now is PAST the whole window, we have
  // no current tide data — return null rather than re-deriving from a stale start
  // (which would report a past tide as "next").
  let i = times.findIndex((t) => typeof t === 'string' && t >= localNowIso)
  if (i < 0) return null
  // Need a defined slope to start: advance to the first pair of real numbers.
  while (i < heights.length - 1 && (num(heights[i]) === null || num(heights[i + 1]) === null)) i++
  if (i >= heights.length - 1) return null

  const rising = heights[i + 1] >= heights[i]
  // Walk forward to the first index where the slope reverses → the turning point.
  let j = i + 1
  let flipped = false
  while (j < heights.length - 1) {
    const a = num(heights[j])
    const b = num(heights[j + 1])
    if (a === null || b === null) break
    const stillRising = b >= a
    if (stillRising !== rising) {
      flipped = true
      break // slope flipped → j is the extremum
    }
    j++
  }
  // Monotonic to the window edge → no REAL turning point. Don't present the window
  // boundary as a high/low (that would be a fabricated tide time).
  if (!flipped) return null
  return {
    state: rising ? 'rising' : 'falling',
    heightM: num(marine?.current?.sea_level_height_msl) ?? num(heights[i]),
    next: { type: rising ? 'high' : 'low', at: times[j] || null },
  }
}

// Assemble the public conditions object from the two upstream payloads. Either
// can be null (a failed/absent fetch) — weather null means "no conditions" and
// the tray won't re-rank; tide null means "no coast here".
export function buildConditions(forecastJson, marineJson, nowMs) {
  const weather = forecastJson ? normalizeForecast(forecastJson) : null
  const tide = marineJson ? deriveTide(marineJson, nowMs) : null
  return { weather, tide }
}
