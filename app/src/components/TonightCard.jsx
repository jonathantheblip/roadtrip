import { wazeUrl, appleMapsUrl } from '../utils/navLinks'
import './TonightCard.css'

function isTbd(v) {
  return !v || String(v).toLowerCase().includes('tbd') || v === 'N/A'
}

export function TonightCard({ overnight, activePerson }) {
  const hasRealAddress =
    overnight.address && !overnight.address.toLowerCase().includes('tbd')
  const navHref = hasRealAddress
    ? activePerson === 'jonathan'
      ? wazeUrl({ address: overnight.address })
      : appleMapsUrl(overnight.address)
    : null
  const navLabel = activePerson === 'jonathan' ? 'Waze' : 'Apple Maps'

  const rows = []
  if (overnight.checkIn)
    rows.push(['Check-in', overnight.checkIn])
  if (overnight.checkOut)
    rows.push(['Check-out', overnight.checkOut])
  if (overnight.checkInMethod && !isTbd(overnight.checkInMethod))
    rows.push(['Entry', overnight.checkInMethod])
  if (overnight.host) {
    const host = overnight.coHost
      ? `${overnight.host} (co-host ${overnight.coHost})`
      : overnight.host
    rows.push(['Host', host])
  }
  if (overnight.hostPhone) rows.push(['Host phone', overnight.hostPhone])
  if (overnight.hostContact) rows.push(['Host', overnight.hostContact])
  if (overnight.reservationCode)
    rows.push(['Reservation', overnight.reservationCode])
  if (overnight.guests && overnight.guests !== 'Family')
    rows.push(['Guests', overnight.guests])
  if (overnight.cost) rows.push(['Cost', overnight.cost])
  if (overnight.wifiPassword && !isTbd(overnight.wifiPassword))
    rows.push(['Wi-Fi', overnight.wifiPassword])

  return (
    <aside className="tonight-card" aria-label="Tonight\u2019s lodging">
      <div className="tonight-label">Tonight</div>
      <h3 className="tonight-lodging">{overnight.lodging}</h3>
      <div className="tonight-region">{overnight.region}</div>

      <div className="tonight-body">
        <div className="tonight-row tonight-address">{overnight.address}</div>
        {rows.map(([k, v]) => (
          <div className="tonight-row" key={k}>
            <span className="tonight-key">{k}</span>
            <span className="tonight-val">{v}</span>
          </div>
        ))}
      </div>

      {overnight.notes && <p className="tonight-notes">{overnight.notes}</p>}

      {navHref && (
        <a
          className="tonight-nav"
          href={navHref}
          target="_blank"
          rel="noopener"
        >
          Navigate with {navLabel}
        </a>
      )}
    </aside>
  )
}
