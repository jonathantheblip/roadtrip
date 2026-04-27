import { TRAVELERS, TRAVELER_ORDER } from '../data/travelers'

// Bottom pill switcher: visible on every themed view, lets anyone view
// any other person's surface. Default load is the active traveler.
export function Switcher({ active, onSwitch }) {
  return (
    <div className="switcher">
      <div className="switcher-inner">
        {TRAVELER_ORDER.map((id) => {
          const t = TRAVELERS[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSwitch(id)}
              className={active === id ? '' : 'inactive'}
              style={{ backgroundColor: active === id ? t.color : 'transparent' }}
              aria-pressed={active === id}
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
