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
                // C2: aurelia's pink dot (#E8478C) fails white text (3.68) — dark ink,
                // same as C1's white-on-pink fill fix. Inactive is a readable-secondary
                // color (0.6 on the dark pill = 5.85:1 worst), not the old opacity:.5 kill.
                color: isActive
                  ? (id === 'aurelia' ? '#2A0816' : '#fff')
                  : 'rgba(255,255,255,0.6)',
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
