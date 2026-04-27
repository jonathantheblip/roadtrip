// Per-trip .ics generation. Spec §9: one event per stop, all-day events
// for travel days, optional per-traveler filtering. Events are emitted
// as floating local time (no TZID) so they show up at the planned local
// hour wherever the subscriber's calendar is.

const PROD = '-//Jackson Family//Trip Platform//EN'
const CRLF = '\r\n'

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function uid(tripId, stopId) {
  return `${stopId}@${tripId}.jacksonfamily.roadtrip`
}

// "Sat Apr 18" + "9:30 AM" + "2026-04-18" → 20260418T093000
function toLocalStamp(isoDate, time) {
  if (!isoDate) return null
  const d = new Date(`${isoDate}T00:00:00`)
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  // Try to parse "9:30 AM" / "10:00 PM" / "Sundown" / "Evening"
  const m = (time || '').trim().match(/^(\d{1,2}):?(\d{0,2})\s*([APap][Mm])?$/)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const ampm = (m[3] || '').toUpperCase()
    if (ampm === 'PM' && h < 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return `${ymd}T${pad(h)}${pad(min)}00`
  }
  // Word-times → fixed conventional slots
  const wordMap = {
    morning: '09', afternoon: '13', pm: '15', evening: '18',
    sundown: '19', night: '21', late: '21', day: '12',
  }
  const key = (time || '').toLowerCase().split(/\s+/)[0]
  if (wordMap[key]) return `${ymd}T${wordMap[key]}0000`
  // No useful time — fall back to all-day style by returning the date stamp
  return ymd
}

function escapeText(s = '') {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line) {
  // RFC5545: lines >75 octets must be folded with CRLF + space.
  const out = []
  let l = line
  while (l.length > 73) {
    out.push(l.slice(0, 73))
    l = ' ' + l.slice(73)
  }
  out.push(l)
  return out.join(CRLF)
}

function buildEvent(trip, day, stop) {
  const stamp = toLocalStamp(day.isoDate, stop.time)
  const isAllDay = stamp && stamp.length === 8
  const summary = escapeText(stop.name)
  const desc = escapeText(`${stop.kind} · ${stop.note}`)
  const loc = escapeText(stop.address || '')

  const lines = ['BEGIN:VEVENT', `UID:${uid(trip.id, stop.id)}`]
  lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`)
  if (isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${stamp}`)
    // 1-day all-day event: DTEND is exclusive day after
    const d = new Date(`${day.isoDate}T00:00:00`)
    d.setDate(d.getDate() + 1)
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    lines.push(`DTEND;VALUE=DATE:${ymd}`)
  } else if (stamp) {
    lines.push(`DTSTART:${stamp}`)
    // 1-hour default duration
    lines.push(`DURATION:PT1H`)
  } else {
    // Couldn't parse — emit as all-day on the day's date
    const ymd = day.isoDate ? day.isoDate.replace(/-/g, '') : ''
    if (ymd) {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`)
    }
  }
  lines.push(`SUMMARY:${summary}`)
  if (loc) lines.push(`LOCATION:${loc}`)
  if (desc) lines.push(`DESCRIPTION:${desc}`)
  lines.push('END:VEVENT')
  return lines.map(foldLine).join(CRLF)
}

// Build the .ics text. travelerId is optional — if provided, only stops
// where that traveler is in `for` are included.
export function buildIcs(trip, travelerId = null) {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PROD}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(
      travelerId ? `${trip.title} — ${travelerId}` : trip.title
    )}`,
  ].join(CRLF)

  const events = []
  for (const day of trip.days) {
    for (const stop of day.stops) {
      if (travelerId && !(stop.for || []).includes(travelerId)) continue
      events.push(buildEvent(trip, day, stop))
    }
  }
  const footer = 'END:VCALENDAR'
  return [header, ...events, footer].join(CRLF) + CRLF
}

// Trigger an .ics download in the browser.
export function downloadIcs(trip, travelerId = null) {
  const ics = buildIcs(trip, travelerId)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${trip.id}${travelerId ? `-${travelerId}` : ''}.ics`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
