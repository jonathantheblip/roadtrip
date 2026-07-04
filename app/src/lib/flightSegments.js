// Multi-leg (connecting) flights — design 03-scaling-the-home.md §5 + build
// notes: "Flights become legs with their own zones. Each segment shows its
// own local time + airport zone; a '+1 day' marks the calendar crossing;
// layovers are explicit." Lives beside — never replaces — the legacy flat
// fields a stop already carries (flightNumber/flightOrigin/flightDest/
// flightDate/scheduledArrivalLocal): those are read-only history now, but a
// stop written before this module shipped must still render exactly as it
// always has (G5). Every reader below goes through ONE normalizer so a
// legacy stop and a modern multi-segment one are indistinguishable to a
// caller.
//
//   stop.flight = {
//     segments: [{
//       flightNo, durationMin?,
//       from: { code, city?, tz? }, to: { code, city?, tz? },
//       dep:  { date, local },      // both a plain ISO date + a free-text
//       arr:  { date, local },      // "local" clock string (matches the
//     }],                          //  rest of the app's stop.time convention)
//     layovers: [{ code, mins }],   // layovers[i] sits between segments[i]
//   }                               // and segments[i+1] — one fewer than segments
//
// "+N day" is a PLAIN DATE DIFF between a segment's dep.date and arr.date —
// no timezone-conversion math needed, because whoever enters a segment (a
// person, or the AI) already resolves both dates in their OWN local zone,
// exactly like a real boarding pass. That's the load-bearing simplification
// this module leans on throughout.

// Pure, dependency-free date-string diff — mirrors the day-count pattern
// already used elsewhere (e.g. RafaPad's tripCountdown): local-noon avoids
// any DST-boundary rounding surprise.
function dayDiff(fromIso, toIso) {
  if (!fromIso || !toIso) return null
  const a = Date.parse(fromIso + 'T12:00:00')
  const b = Date.parse(toIso + 'T12:00:00')
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

function cleanLeg(leg) {
  const code = typeof leg?.code === 'string' ? leg.code.trim().toUpperCase() : ''
  const city = typeof leg?.city === 'string' ? leg.city.trim() : ''
  const tz = typeof leg?.tz === 'string' ? leg.tz.trim() : ''
  return { code, city, tz }
}
function cleanStamp(s) {
  const date = typeof s?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : null
  const local = typeof s?.local === 'string' ? s.local.trim() : ''
  return { date, local }
}

// One segment, defensively normalized (never throws on a malformed row).
function cleanSegment(seg) {
  return {
    flightNo: typeof seg?.flightNo === 'string' ? seg.flightNo.trim() : '',
    from: cleanLeg(seg?.from),
    to: cleanLeg(seg?.to),
    dep: cleanStamp(seg?.dep),
    arr: cleanStamp(seg?.arr),
    durationMin: Number.isFinite(seg?.durationMin) ? seg.durationMin : null,
  }
}

// The stop's flight segments — the modern `stop.flight.segments[]` wins;
// otherwise a legacy flat-field stop synthesizes exactly ONE segment (arrival
// side only — the flat shape never recorded a departure date/zone, so that
// side stays honestly absent rather than guessed). No flight fields at all
// → [].
export function flightSegments(stop) {
  const explicit = stop?.flight?.segments
  if (Array.isArray(explicit) && explicit.length) return explicit.map(cleanSegment)
  if (!stop?.flightNumber) return []
  return [
    cleanSegment({
      flightNo: stop.flightNumber,
      from: { code: stop.flightOrigin },
      to: { code: stop.flightDest },
      arr: { date: stop.flightDate, local: stop.scheduledArrivalLocal || stop.time },
    }),
  ]
}

// Layovers between segments (empty for a legacy/single-segment stop, or a
// modern multi-segment one that just never recorded a layover, which
// shouldn't happen in practice but never throws either way).
export function flightLayovers(stop) {
  const layovers = stop?.flight?.layovers
  return Array.isArray(layovers)
    ? layovers.map((l) => ({
        code: typeof l?.code === 'string' ? l.code.trim().toUpperCase() : '',
        mins: Number.isFinite(l?.mins) ? l.mins : null,
      }))
    : []
}

export function isMultiSegmentFlight(stop) {
  return flightSegments(stop).length > 1
}

// The honest "+N day" for one segment — null (never a fabricated "+0") when
// either date is missing, per the design's rule 4 ("never render a time/
// label/percentage the data doesn't back").
export function segmentDayDelta(segment) {
  const d = dayDiff(segment?.dep?.date, segment?.arr?.date)
  return d == null || d <= 0 ? null : d
}

// The overall trip-spanning day delta — first segment's departure to the
// LAST segment's arrival (the family's actual door-to-door crossing, which
// can differ from any single segment's own delta once layovers are folded
// in). Null under the same honesty rule.
export function overallDayDelta(stop) {
  const segs = flightSegments(stop)
  if (segs.length < 2) return segmentDayDelta(segs[0])
  return dayDiff(segs[0]?.dep?.date, segs[segs.length - 1]?.arr?.date) || null
}

function weekday(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' })
}

// A short leg description: "9:35 PM BOS" / "2:20 PM FCO +1 Mon" — omits
// whatever piece isn't known rather than rendering a blank or a fabricated
// placeholder.
function legPiece(stamp, leg, dayTag) {
  const bits = [stamp?.local, leg?.code].filter(Boolean)
  if (!bits.length) return ''
  return dayTag ? `${bits.join(' ')} ${dayTag}` : bits.join(' ')
}

// The condensed Next-Up line (design 03 §5): "9:35p BOS → 2:20p FCO · +1 Mon
// · 1 stop FRA" for a real connection; the plain "flightNo · ORIGIN→DEST"
// line (today's exact format, byte-identical) for a single/legacy segment —
// this is the ONE place a caller should read to show a flight, single or
// connecting, without branching on segment count itself.
export function flightSummaryLine(stop) {
  const segs = flightSegments(stop)
  if (!segs.length) return ''
  if (segs.length === 1) {
    const s = segs[0]
    return `${s.flightNo}${s.from.code ? ` · ${s.from.code}→${s.to.code || ''}` : ''}`
  }
  const first = segs[0]
  const last = segs[segs.length - 1]
  const delta = overallDayDelta(stop)
  const dayTag = delta ? `+${delta} ${weekday(last.arr.date)}` : ''
  const depPiece = legPiece(first.dep, first.from)
  const arrPiece = legPiece(last.arr, last.to, dayTag)
  const route = [depPiece, arrPiece].filter(Boolean).join(' → ')
  const layovers = flightLayovers(stop)
  const stops = segs.length - 1
  const via = stops > 0
    ? `${stops} stop${stops === 1 ? '' : 's'}${layovers[0]?.code ? ` ${layovers.map((l) => l.code).filter(Boolean).join('/')}` : ''}`
    : ''
  return [route, via].filter(Boolean).join(' · ')
}

// A blank segment for the editor's "Add a connection" action.
export function emptyFlightSegment() {
  return {
    flightNo: '', from: { code: '', city: '', tz: '' }, to: { code: '', city: '', tz: '' },
    dep: { date: '', local: '' }, arr: { date: '', local: '' }, durationMin: null,
  }
}
