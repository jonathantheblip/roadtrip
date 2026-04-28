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
                color: isActive ? '#fff' : 'rgba(255,255,255,0.85)',
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
