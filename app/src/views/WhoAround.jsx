// "Who's around" (slice 8) — the Now-tab family presence band. Faithful to the
// design's PresenceRow (app/docs/design/family-trips-hangout): one row per family
// member — avatar + a live/idle dot, "name · where" (coarse), and a "what" line.
//
// Honest by construction: the dot is "live" only when the row was refreshed within
// LIVE_MS; otherwise it's idle ("last seen…"). The caption states plainly that
// location is shared only while the app is open (a PWA can't track in the
// background — we never imply it does). A person with no row is shown, faded, as
// "not sharing right now" rather than guessed-at.

import { useState } from 'react'
import { TRAVELER_ORDER, TRAVELERS } from '../data/travelers'
import { Avatar } from '../components/Avatar'
import { freshness } from '../lib/presenceRules'

const LIVE_DOT = '#2fbf71' // a steady green, readable on every lens (light + dark)

function whereLabel(bucket, place) {
  if (bucket === 'at_place') return `at ${place?.name || 'the place'}`
  if (bucket === 'out') return 'out & about'
  return null
}

export function WhoAround({ people = [], me, place, roster, now = Date.now(), onSetStatus, onWave }) {
  const myRow = people.find((p) => p.traveler === me)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const openEditor = () => {
    setDraft(myRow?.note || '')
    setEditing(true)
  }
  const save = () => {
    onSetStatus?.(draft.trim().slice(0, 80))
    setEditing(false)
  }
  const clear = () => {
    onSetStatus?.('')
    setDraft('')
    setEditing(false)
  }

  // Render nothing until there's presence to show. On a live stay this device
  // posts its own row within a poll cycle, so "you" appears almost immediately;
  // the band simply isn't there in the brief gap (or when the worker's offline),
  // which is cleaner than a "nobody's sharing" placeholder taking up the home.
  if (people.length === 0) return null

  // Show only the people actually ON this trip (in canonical order), not a fixed
  // family of four — on a Jonathan+Helen-only trip the kids aren't travelling, so
  // showing them faded as "not sharing right now" wrongly implies they're here.
  // No roster passed (back-compat) → the full family, unchanged.
  const order =
    Array.isArray(roster) && roster.length
      ? TRAVELER_ORDER.filter((id) => roster.includes(id))
      : TRAVELER_ORDER

  return (
    <section aria-label="Who's around" data-testid="whos-around" style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 600,
          }}
        >
          Who&rsquo;s around
        </span>
        <span style={{ flex: 1, height: 1, background: 'var(--line, rgba(0,0,0,0.08))' }} />
      </div>

      {order.map((id) => {
        const t = TRAVELERS[id]
        if (!t) return null
        const row = people.find((p) => p.traveler === id)
        const isMe = id === me
        const fr = row ? freshness(row.updatedAt, now) : { live: false, ago: '' }
        const where = row ? whereLabel(row.placeBucket, place) : null
        const second = row
          ? row.note || (fr.live ? 'here now' : `last seen ${fr.ago}`)
          : 'not sharing right now'
        const dotColor = row ? (fr.live ? LIVE_DOT : 'var(--muted)') : 'var(--line-bold, #bbb)'
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
            <div style={{ position: 'relative', opacity: row ? 1 : 0.5 }}>
              <Avatar id={id} size={30} />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: -1,
                  bottom: -1,
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  background: dotColor,
                  boxShadow: '0 0 0 2px var(--card, #fff)',
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>
                {t.name}
                {isMe && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> &middot; you</span>}
                {where && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> &middot; {where}</span>}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--muted)',
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {second}
              </div>
            </div>
            {isMe && !editing && (
              <button type="button" onClick={openEditor} style={LINK_BTN}>
                {myRow?.note ? 'Edit' : 'Set status'}
              </button>
            )}
            {!isMe && onWave && <WaveBtn name={t.name} onWave={() => onWave(id)} />}
          </div>
        )
      })}

      {editing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0 2px' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            placeholder="What are you up to?"
            aria-label="Set your status"
            style={{
              flex: 1,
              fontSize: 13,
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid var(--line, #ccc)',
              background: 'var(--bg, #fff)',
              color: 'var(--text)',
            }}
          />
          <button type="button" onClick={save} style={PILL_BTN}>
            Save
          </button>
          {myRow?.note && (
            <button type="button" onClick={clear} style={LINK_BTN}>
              Clear
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--muted)' }}>
        Shared only while the app is open.
      </div>
    </section>
  )
}

const LINK_BTN = {
  background: 'none',
  border: 'none',
  // --accent-text is the per-lens AA-safe accent-as-TEXT token (the bare --accent
  // is a FILL color and fails AA as 12px text on a light lens, e.g. Helen's paper).
  color: 'var(--accent-text, #2b6cb0)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px 6px',
  flexShrink: 0,
}
const PILL_BTN = {
  background: 'var(--accent, #2b6cb0)',
  color: 'var(--accent-ink, #fff)',
  border: 'none',
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '7px 12px',
  flexShrink: 0,
}

// A small per-row 👋 — wave at this family member (bidirectional). Local "sent"
// ack (👋 → 💛); the worker delivers it to their device (lib/waves).
function WaveBtn({ name, onWave }) {
  const [sent, setSent] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { setSent(true); onWave() }}
      disabled={sent}
      aria-label={sent ? `Waved at ${name}` : `Wave at ${name}`}
      style={{ background: 'none', border: 'none', cursor: sent ? 'default' : 'pointer', fontSize: 18, padding: '2px 6px', flexShrink: 0, opacity: sent ? 0.75 : 1 }}
    >
      {sent ? '💛' : '👋'}
    </button>
  )
}
