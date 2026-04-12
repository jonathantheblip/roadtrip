import { useMemo } from 'react'
import { PIN_COLORS } from '../data/route'
import { useGeolocation, distanceKm } from '../hooks/useGeolocation'
import './RouteSvg.css'

const STATE_ORDER = ['MA', 'CT', 'NY', 'PA', 'VA', 'TN', 'AL', 'MS', 'LA', 'TX']

const STATE_FULL = {
  MA: 'Massachusetts', CT: 'Connecticut', NY: 'New York', PA: 'Pennsylvania',
  VA: 'Virginia', TN: 'Tennessee', AL: 'Alabama', MS: 'Mississippi',
  LA: 'Louisiana', TX: 'Texas',
}

const SEGMENT_Y = {
  MA: 20, CT: 70, NY: 140, PA: 220, VA: 320, TN: 440,
  AL: 530, MS: 620, LA: 720, TX: 810,
}

const SEGMENT_X = {
  MA: 160, CT: 140, NY: 180, PA: 120, VA: 160, TN: 140,
  AL: 180, MS: 140, LA: 160, TX: 180,
}

function pinColor(stop) {
  if (stop.name?.toLowerCase().includes('buc-ee')) return '#fdd835'
  for (const t of ['viral', 'energy', 'food', 'photo', 'poi', 'gas']) {
    if (stop.types?.includes(t)) return PIN_COLORS[t]
  }
  return '#6b7280'
}

export function RouteSvg({ stops, onStopSelect, selectedStopId }) {
  const { lastKnown } = useGeolocation()

  const { dots, routePath, stateLabels, svgHeight } = useMemo(() => {
    const grouped = {}
    stops.forEach((s) => {
      const st = s.state || 'TX'
      if (!grouped[st]) grouped[st] = []
      grouped[st].push(s)
    })

    const dots = []
    const pathPoints = []
    const labels = []
    let maxY = 0

    STATE_ORDER.forEach((st) => {
      const baseY = SEGMENT_Y[st]
      const baseX = SEGMENT_X[st]
      if (!baseY) return

      labels.push({ state: st, full: STATE_FULL[st], x: 20, y: baseY })
      pathPoints.push([baseX, baseY])

      const items = grouped[st] || []
      items.forEach((s, i) => {
        const y = baseY + 14 + i * 16
        const x = baseX + (i % 2 === 0 ? 12 : -12)
        dots.push({ stop: s, x, y })
        if (y > maxY) maxY = y
      })
    })

    const routePath = pathPoints.map((p, i) =>
      i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`
    ).join(' ')

    return { dots, routePath, stateLabels: labels, svgHeight: maxY + 40 }
  }, [stops])

  const liveMarker = useMemo(() => {
    if (!lastKnown || !dots.length) return null
    let best = null
    let bestD = Infinity
    for (const d of dots) {
      if (d.stop.lat == null) continue
      const dist = distanceKm(lastKnown, { lat: d.stop.lat, lng: d.stop.lng })
      if (dist < bestD) {
        bestD = dist
        best = d
      }
    }
    if (!best) return null
    const label = new Date(lastKnown.timestamp || Date.now()).toLocaleTimeString(
      [],
      { hour: 'numeric', minute: '2-digit' }
    )
    return { x: best.x, y: best.y, label }
  }, [lastKnown, dots])

  return (
    <div className="route-svg-wrap">
      <svg
        className="route-svg"
        viewBox={`0 0 300 ${svgHeight}`}
        width="300"
        height={svgHeight}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path className="route-line" d={routePath} />

        {stateLabels.map((l) => (
          <text key={l.state} className="state-label" x={l.x} y={l.y + 4}>
            {l.full}
          </text>
        ))}

        {dots.map(({ stop, x, y }) => {
          const color = pinColor(stop)
          const r = stop.star ? 6 : 4
          const dimmed = selectedStopId && selectedStopId !== stop.id
          return (
            <g
              key={stop.id}
              className={`stop-dot ${dimmed ? 'dimmed' : ''}`}
              onClick={() => onStopSelect?.(stop)}
            >
              {stop.star && (
                <circle cx={x} cy={y} r={r + 3} fill={color} opacity={0.2} />
              )}
              <circle cx={x} cy={y} r={r} fill={color} />
            </g>
          )
        })}

        {liveMarker && (
          <g className="live-marker">
            <circle cx={liveMarker.x} cy={liveMarker.y} r={10} fill="#1976d2" opacity={0.2} />
            <circle
              cx={liveMarker.x}
              cy={liveMarker.y}
              r={5}
              fill="#1976d2"
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              className="live-label"
              x={liveMarker.x + 10}
              y={liveMarker.y + 4}
            >
              Last updated {liveMarker.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
