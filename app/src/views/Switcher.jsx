import { TRAVELERS, TRAVELER_DOT, TRAVELER_ORDER } from '../data/travelers'

// FamilyDock: persistent bottom pill from the Design bundle. Active
// pill paints in the active traveler's dot color (Jonathan navy /
// Helen forest / Aurelia hot pink / Rafa oxblood); inactive pills are
// transparent over the dark blurred backdrop. Name + role subtitle
// per Design system.jsx FamilyDock.
export function Switcher({ active, onSwitch }) {
  return (
    <div className="switcher">
      <div className="switcher-inner">
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
                  ? (id === 'aurelia' ? '#2A0816' : id === 'rafa' ? '#1B1108' : '#fff')
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
  )
}
