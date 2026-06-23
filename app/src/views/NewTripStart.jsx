import { Home, Building2, Car, Sun, Globe, Sparkles, ChevronLeft } from 'lucide-react'

// The shape-first front door (new-trip redesign, Phase 1 · increment 2).
//
// Replaces "the plain form is the entry" with "what kind of trip is this?" — the
// redesign's core move (FAMILY_TRIPS_VISION: any shape, never road-trip-first).
// It LEADS with the AI concierge (Plan with Claude — the existing create_trip
// flow, which already turns a sentence into a real trip) and offers the five
// shapes as the deliberate escape. Simple shapes route to the manual form with
// the shape preset; the bigger/composite trip is best described to Claude for now
// (the bespoke parts-builder is a later increment).
//
// Theme-aware like NewTrip (surface-light/dark + CSS vars) so it wears the
// creator's lens. Only the title is ever required downstream — nothing here asks
// for anything, so there are no false "required" markers.
const SHAPES = [
  { key: 'stay', label: 'A stay', desc: 'A cabin, Grandma’s, a beach house', Icon: Home },
  { key: 'city', label: 'A city trip', desc: 'Fly in, see the sights', Icon: Building2 },
  { key: 'road', label: 'A road trip', desc: 'Drive from place to place', Icon: Car },
  { key: 'together', label: 'Just time together', desc: 'Low-key, nothing planned', Icon: Sun },
  { key: 'bigger', label: 'A bigger trip', desc: 'Several parts in one', Icon: Globe, composite: true },
]

export function NewTripStart({ onBack, onPickShape, onPlanWithClaude, dark = false }) {
  return (
    <div className={`min-h-screen pb-32 ${dark ? 'surface-dark' : 'surface-light'}`}>
      <header
        className="px-6 pb-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="link-quiet flex items-center gap-1 f-dm text-xs opacity-70"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 24 }}
          type="button"
        >
          <ChevronLeft size={14} /> Trips
        </button>
        <h1 className="f-news tt-tightest text-5xl leading-95">What kind of trip?</h1>
        <p className="f-news-i text-base opacity-60 mt-2 max-w-md">
          Tell me about it and I’ll lay it out — or pick a shape to fill in yourself.
          Nothing here is final; you finish it in the editor.
        </p>
      </header>

      <div className="px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* LEAD: the concierge — describe it (or drop a booking) and Claude builds it. */}
        <button
          type="button"
          onClick={onPlanWithClaude}
          aria-label="Plan the trip with Claude — describe it and it builds the trip"
          style={{
            display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer',
            padding: '18px 16px', borderRadius: 'var(--radius, 14px)',
            border: '1px solid var(--accent, var(--text))',
            background: 'transparent', color: 'inherit', width: '100%',
          }}
        >
          <Sparkles size={22} style={{ color: 'var(--accent-text, var(--text))', flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="f-dm" style={{ fontSize: 15, fontWeight: 600 }}>Tell me about the trip</span>
            <span className="f-dm" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Describe it in a sentence (or paste a booking) and I’ll build it for you.
            </span>
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="smallcaps f-dm text-[11px]" style={{ color: 'var(--muted)' }}>or pick a kind of trip</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SHAPES.map(({ key, label, desc, Icon, composite }) => (
            <button
              key={key}
              type="button"
              data-shape={key}
              onClick={() => (composite ? onPlanWithClaude?.() : onPickShape?.(key))}
              aria-label={`${label} — ${desc}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 'var(--radius, 14px)',
                border: '1px solid var(--border)', background: 'var(--card)', color: 'inherit', width: '100%',
              }}
            >
              <Icon size={22} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <span className="f-dm" style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
                <span className="f-dm" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{desc}</span>
              </span>
              {composite && (
                <span className="f-dm" style={{ fontSize: 11, color: 'var(--accent-text, var(--muted))', whiteSpace: 'nowrap' }}>
                  with Claude
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
