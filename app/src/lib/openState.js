// Compute the open/closed state of an activity from its Google Places
// `regularOpeningHours.periods` data (persisted as `hoursStructured.periods`).
//
// Returns:
//   { status: 'open' | 'opens_later' | 'closed_today' | 'unknown',
//     label: string,
//     nextChangeAt: Date | null }
//
// The card uses `status` to drive a small color indicator (green / amber /
// neutral) and renders `label` directly. `nextChangeAt` is exposed so a
// future refresh-on-rollover scheduler can fire when the state changes.
//
// If the activity has no structured periods, status is 'unknown' and the
// label falls back to the human-curated `activity.hours` string.
//
// Day-of-week conventions match JavaScript Date.getDay(): 0 = Sunday
// through 6 = Saturday. Google's Places API uses the same numbering.

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Format an hour/minute pair as "4pm" or "10:30am" — no leading zero
// on the hour, lowercase am/pm, no space.
export function formatTime(hour, minute) {
  const h = ((hour % 24) + 24) % 24
  const m = minute || 0
  const ampm = h >= 12 ? 'pm' : 'am'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return m === 0
    ? `${h12}${ampm}`
    : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

// Convert a {day, hour, minute} period point to absolute minutes from
// the start of the week (Sunday 00:00).
function pointToWeekMinutes(p) {
  return p.day * 1440 + p.hour * 60 + (p.minute || 0)
}

// Build a Date for a {day, hour, minute} relative to `now`'s week.
function pointToDate(now, day, hour, minute) {
  const d = new Date(now)
  d.setDate(d.getDate() + (day - d.getDay()))
  d.setHours(hour, minute || 0, 0, 0)
  return d
}

export function computeOpenState(activity, now = new Date()) {
  const periods = activity?.hoursStructured?.periods
  if (!Array.isArray(periods) || periods.length === 0) {
    return {
      status: 'unknown',
      label: activity?.hours || '',
      nextChangeAt: null,
    }
  }

  const today = now.getDay()
  const nowMins = today * 1440 + now.getHours() * 60 + now.getMinutes()
  const weekMins = 7 * 1440

  // 24/7 signal from Places: one or more periods present, but at least
  // one has no `close` field. Per the Places API spec, "If a location
  // is always open, the close field will be missing." Short-circuit to
  // a permanently-open state.
  if (periods.some((p) => p?.open && !p.close)) {
    return { status: 'open', label: 'Open 24/7', nextChangeAt: null }
  }

  // Pass 1: are we inside any period right now? Periods can cross
  // midnight (open Mon 6pm, close Tue 2am) so closeMins may legitimately
  // exceed openMins by more than 24h-1m. The wraparound math is just
  // modular arithmetic over week-minutes.
  for (const p of periods) {
    if (!p.open || !p.close) continue
    const openMins = pointToWeekMinutes(p.open)
    const closeMins = pointToWeekMinutes(p.close)
    let span = closeMins - openMins
    if (span <= 0) span += weekMins // wrap-around (e.g., Sat 10am → Sun 1am)
    let delta = nowMins - openMins
    if (delta < 0) delta += weekMins
    if (delta < span) {
      const closeDate = pointToDate(
        now,
        p.close.day,
        p.close.hour,
        p.close.minute
      )
      return {
        status: 'open',
        label: `Open until ${formatTime(p.close.hour, p.close.minute)}`,
        nextChangeAt: closeDate,
      }
    }
  }

  // Pass 2: find the next upcoming open. Sort by week-distance from now.
  const upcoming = []
  for (const p of periods) {
    if (!p.open) continue
    const openMins = pointToWeekMinutes(p.open)
    let dist = openMins - nowMins
    if (dist <= 0) dist += weekMins
    upcoming.push({ p, dist })
  }
  upcoming.sort((a, b) => a.dist - b.dist)

  if (upcoming.length === 0) {
    return {
      status: 'unknown',
      label: activity?.hours || '',
      nextChangeAt: null,
    }
  }

  const next = upcoming[0]
  const openDay = next.p.open.day
  const nextOpenDate = pointToDate(
    now,
    openDay,
    next.p.open.hour,
    next.p.open.minute
  )
  if (openDay === today) {
    return {
      status: 'opens_later',
      label: `Opens at ${formatTime(next.p.open.hour, next.p.open.minute)}`,
      nextChangeAt: nextOpenDate,
    }
  }
  return {
    status: 'closed_today',
    label: `Closed today · opens ${DAYS_SHORT[openDay]} ${formatTime(
      next.p.open.hour,
      next.p.open.minute
    )}`,
    nextChangeAt: nextOpenDate,
  }
}

// Map a status to the indicator color the card should render.
export function openStateColor(status) {
  switch (status) {
    case 'open':
      return 'var(--accent-success, #22c55e)'
    case 'opens_later':
      return 'var(--accent-warning, #f59e0b)'
    default:
      return 'var(--muted)'
  }
}
