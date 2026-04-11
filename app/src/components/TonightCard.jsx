import { wazeUrl, appleMapsUrl } from '../utils/navLinks'
import './TonightCard.css'

export function TonightCard({ overnight, activePerson }) {
  const hasRealAddress =
    overnight.address && !overnight.address.toLowerCase().includes('tbd')
  const navHref = hasRealAddress
    ? activePerson === 'jonathan'
      ? wazeUrl({ address: overnight.address })
      : appleMapsUrl(overnight.address)
    : null
  const navLabel = activePerson === 'jonathan' ? 'Waze' : 'Apple Maps'

  return (
    <aside className="tonight-card" aria-label="Tonight\u2019s lodging">
      <div className="tonight-label">Tonight</div>
      <h3 className="tonight-lodging">{overnight.lodging}</h3>
      <div className="tonight-region">{overnight.region}</div>

      <div className="tonight-body">
        <div className="tonight-row tonight-address">{overnight.address}</div>
        {overnight.checkIn && (
          <div className="tonight-row">
            <span className="tonight-key">Check-in</span>
            <span className="tonight-val">{overnight.checkIn}</span>
          </div>
        )}
        {overnight.hostContact && (
          <div className="tonight-row">
            <span className="tonight-key">Host</span>
            <span className="tonight-val">{overnight.hostContact}</span>
          </div>
        )}
        {overnight.wifiPassword && (
          <div className="tonight-row">
            <span className="tonight-key">Wi-Fi</span>
            <span className="tonight-val">{overnight.wifiPassword}</span>
          </div>
        )}
      </div>

      {overnight.notes && (
        <p className="tonight-notes">{overnight.notes}</p>
      )}

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
