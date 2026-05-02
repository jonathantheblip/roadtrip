import { Toilet, Beef, TreePine, Siren } from 'lucide-react'
import { TRAVELERS } from '../data/travelers'

// Quick "near me" search panel — works the same on a driving day, a
// flight layover, or a walk through Manhattan. Shows for Jonathan,
// Helen, and Aurelia (Rafa view doesn't surface it). Each button opens
// the active traveler's preferred maps app with a category query —
// Apple Maps and Waze both interpret these as "near me" by default
// once the user has location permission.
//
// Categories per spec:
//   bathroom → public restrooms
//   fast food → fast food chains
//   outside  → rest area / park / playground
//   emergency → urgent care / hospital
const CATEGORIES = [
  { id: 'bathroom', label: 'Bathroom', q: 'public restroom', Icon: Toilet },
  { id: 'food', label: 'Fast food', q: 'fast food', Icon: Beef },
  { id: 'outside', label: 'Outside', q: 'rest area park', Icon: TreePine },
  { id: 'emergency', label: 'Emergency', q: 'urgent care', Icon: Siren },
]

function searchUrl(traveler, q) {
  const enc = encodeURIComponent(q)
  if (TRAVELERS[traveler]?.maps === 'waze') {
    return `https://waze.com/ul?q=${enc}&navigate=yes`
  }
  return `https://maps.apple.com/?q=${enc}`
}

export function RoadSearch({ traveler, dark = false }) {
  if (traveler === 'rafa') return null
  return (
    <div className="embed-panel">
      <p
        className="smallcaps f-dm text-[11px] opacity-70 mb-3"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        Near you
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ id, label, q, Icon }) => (
          <a
            key={id}
            className="btn-pill"
            href={searchUrl(traveler, q)}
            target="_blank"
            rel="noreferrer"
            style={{ justifyContent: 'flex-start' }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </a>
        ))}
      </div>
      <p className="f-dm text-[11px] opacity-50 italic mt-3">
        Opens {TRAVELERS[traveler]?.maps === 'waze' ? 'Waze' : 'Apple Maps'} centered on your
        current location.
      </p>
    </div>
  )
}
