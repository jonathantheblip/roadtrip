// StayTabBar — the family-trips recenter shell (FAMILY_TRIPS_VISION; design
// authority: app/docs/design/family-trips-hangout, the "WHAT" axis). On a STAY
// the home becomes four calm surfaces — We could · Now · Photos · Look back —
// instead of one road-trip-shaped scrolling page. This is the bottom tab bar
// that switches between them.
//
// FIRST CUT (additive, low-risk): the four tabs map to the EXISTING surfaces
// (We could → activities, Now → the trip home, Photos → photos, Look back →
// replay) so nothing is re-homed or lost yet; each tab gets its design content
// in later passes. The bar shows ONLY on a stay (route trips keep the shipped
// dock untouched, G5). Themed per-lens via the [data-theme] CSS variables, so
// it adopts each family member's skin automatically.

// key → label (fixed labels per the design's TabBar; the per-lens GREETING
// lives in the header, not the bar). `view` = which App view each tab routes to.
export const STAY_TABS = [
  { key: 'wecould', label: 'We could', view: 'activities' },
  { key: 'now', label: 'Now', view: 'trip' },
  { key: 'photos', label: 'Photos', view: 'photos' },
  { key: 'back', label: 'Look back', view: 'replay' },
]

// Map an App `view.name` to the active tab key (null when not on a tabbed
// surface, so the bar can hide on deep/immersive views).
export function tabForView(viewName) {
  const t = STAY_TABS.find((x) => x.view === viewName)
  return t ? t.key : null
}

// `nowCue` lights a dot on the "Now" tab — on a stay Surprises lives there, so
// its reveal cue (which on a route rides the ⋯ button) follows it onto the tab,
// keeping the signal visible from the We-could / Photos tabs too.
export function StayTabBar({ active, onTab, badge = 0, nowCue = false }) {
  return (
    <nav className="stay-tabbar" aria-label="Trip sections" data-testid="stay-tabbar">
      {STAY_TABS.map(({ key, label }) => {
        const on = key === active
        const cued = key === 'now' && nowCue
        return (
          <button
            key={key}
            type="button"
            className={`stay-tab${on ? ' is-on' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={cued ? `${label} — a surprise was revealed` : undefined}
            onClick={() => onTab(key)}
          >
            <span className="stay-tab-label">{label}</span>
            {((key === 'wecould' && badge > 0) || cued) && (
              <span className="stay-tab-badge" aria-hidden="true" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
