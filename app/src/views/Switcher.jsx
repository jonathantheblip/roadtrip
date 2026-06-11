import { ChevronRight } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT, TRAVELER_ORDER } from '../data/travelers'
import { DockCue } from '../components/DockCue'

// LiveDock = the shipped FamilyDock (the glass persona-switcher pills) PLUS an
// optional live "ledge" that docks IN above the pills during a live trip —
// the NowBar × FamilyDock reconciliation. One glass unit, two jobs: WHO below
// (the pills, geometry/type/behaviour untouched), NOW above (the ledge). The
// pills NEVER move; the ledge appears above them, so the glass grows upward
// from its fixed bottom. Presence is decided by the caller (system-driven:
// trip-live × person), never a setting. See design-handoffs/bottom-zone.
//
//   ledge='none' → exactly the shipped dock (radius 999, pills only)
//   ledge='live' → 46px row: dot · NOW/next readout · optional cue · chevron.
//                  Body taps → Live Map; the cue chip is its own tap target.
//   ledge='cue'  → (Aurelia) the cue IS the row; tapping it opens its feature.

// The cue's accessible name — deliberately free of "Weave" so it can't collide
// with the top-bar ✦ Weave `.first()` locators the suite relies on.
function cueAria(kind) {
  return kind === 'surprise-revealed'
    ? 'A surprise was revealed for you'
    : "Last night's new page is ready"
}

function LiveDot() {
  return (
    <span className="dock-livedot" aria-hidden="true">
      <span className="dock-livedot-core" />
      <span className="dock-livedot-ring" />
    </span>
  )
}

function DockLedge({ active, mode, now, next, cueKind, onLedge, onCue }) {
  if (mode === 'cue') {
    // Aurelia: the whole ledge IS the cue → one button to its feature.
    return (
      <button
        type="button"
        className="dock-ledge dock-ledge-cueonly"
        onClick={onCue}
        aria-label={cueAria(cueKind)}
        data-testid="live-dock-ledge"
      >
        <DockCue kind={cueKind} traveler={active} />
        <span className="dock-ledge-open" aria-hidden="true">OPEN</span>
        <ChevronRight size={14} className="dock-ledge-chev" aria-hidden="true" />
      </button>
    )
  }

  // jonathan / helen — body opens the map; the cue (if any) is a SEPARATE,
  // sibling tap target (no nested interactive elements).
  const mono = active === 'jonathan'
  return (
    <div className="dock-ledge dock-ledge-live">
      <button
        type="button"
        className="dock-ledge-body"
        onClick={onLedge}
        aria-label={`Live map — now ${now || 'on the trip'}${next ? `, next ${next}` : ''}`}
        data-testid="live-dock-ledge"
      >
        <LiveDot />
        <span className="dock-ledge-text">
          <span className="dock-ledge-kicker" aria-hidden="true">NOW · LIVE MAP</span>
          <span
            className="dock-ledge-readout"
            style={{ fontFamily: mono ? MONO : 'var(--font-body)', fontSize: mono ? 11.5 : 13 }}
          >
            {now}
            {next ? <span className="dock-ledge-next"> · {next}</span> : null}
          </span>
        </span>
      </button>
      {cueKind && (
        <button
          type="button"
          className="dock-ledge-cuebtn"
          onClick={onCue}
          aria-label={cueAria(cueKind)}
          data-testid="live-dock-cue"
        >
          <DockCue kind={cueKind} traveler={active} />
        </button>
      )}
      <ChevronRight size={15} className="dock-ledge-chev" aria-hidden="true" />
    </div>
  )
}

const MONO = 'JetBrains Mono, monospace'

// FamilyDock + live ledge. Active pill paints in the active traveler's dot
// color (Jonathan navy / Helen forest / Aurelia hot pink / Rafa oxblood);
// inactive pills are transparent over the dark blurred backdrop. The pill row
// is unchanged from the shipped dock — only the ledge above it is new.
export function Switcher({
  active,
  onSwitch,
  ledge = 'none',
  now = '',
  next = '',
  cueKind = null,
  onLedge,
  onCue,
}) {
  const open = ledge !== 'none'
  return (
    <div className="switcher">
      <div className={`switcher-inner${open ? ' has-ledge' : ''}`} data-ledge={ledge}>
        {open && (
          <>
            <DockLedge
              active={active}
              mode={ledge}
              now={now}
              next={next}
              cueKind={cueKind}
              onLedge={onLedge}
              onCue={onCue}
            />
            <div className="switcher-hairline" />
          </>
        )}
        <div className="switcher-pills">
          {TRAVELER_ORDER.map((id) => {
            const t = TRAVELERS[id]
            const isActive = active === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSwitch(id)}
                className={isActive ? '' : 'inactive'}
                style={{
                  backgroundColor: isActive ? TRAVELER_DOT[id] : 'transparent',
                  // The light identity dots fail white text on the active pill, so
                  // they flip to dark ink (the C1/C2 fill-ink rule): aurelia's pink
                  // #E8478C and rafa's orange #E8552E (both ~3.6 white → ~5+ dark).
                  // Jonathan #2E6BB8 / Helen #2E7D52 keep white (~5:1). Inactive is a
                  // readable-secondary color (0.6 on the dark pill = 5.85:1 worst).
                  color: isActive
                    ? id === 'aurelia'
                      ? '#2A0816'
                      : id === 'rafa'
                        ? '#1B1108'
                        : '#fff'
                    : 'rgba(255,255,255,0.78)',
                }}
                aria-pressed={isActive}
              >
                <div className="label">{t.name}</div>
                <div className="sub">{t.sub}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
