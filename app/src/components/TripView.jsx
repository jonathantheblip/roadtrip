import { useEffect, useMemo, useState } from 'react'
import { ActualLog } from './ActualLog'
import { DriveTimeCalculator } from './DriveTimeCalculator'
import { RePlan } from './RePlan'
import { RiskWatch } from './RiskWatch'
import { seedIfNeeded } from '../utils/actualLog'
import { ACTUAL_SEED } from '../data/actualSeed'
import './TripView.css'

const SUBTABS = [
  { k: 'log', label: 'Log' },
  { k: 'drive', label: 'Drive Time' },
  { k: 'replan', label: 'Re-plan' },
  { k: 'risks', label: 'Risks' },
]

export function TripView({ activePerson }) {
  const [sub, setSub] = useState('log')
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    let active = true
    seedIfNeeded(ACTUAL_SEED)
      .catch((err) => console.warn('log seed failed', err))
      .finally(() => { if (active) setSeeded(true) })
    return () => { active = false }
  }, [])

  return (
    <section className="trip-view">
      <div className="trip-subtabs" role="tablist">
        {SUBTABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={sub === t.k}
            className={`trip-subtab ${sub === t.k ? 'active' : ''}`}
            onClick={() => setSub(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'log' && <ActualLog activePerson={activePerson} seeded={seeded} />}
      {sub === 'drive' && <DriveTimeCalculator activePerson={activePerson} />}
      {sub === 'replan' && <RePlan activePerson={activePerson} />}
      {sub === 'risks' && <RiskWatch />}
    </section>
  )
}
