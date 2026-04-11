import { FLIGHT_HOME } from '../data/overnight'
import './FlightHomeCard.css'

export function FlightHomeCard() {
  return (
    <aside className="flight-card" aria-label="Flight home">
      <div className="flight-eyebrow">Flight Home</div>

      <h3 className="flight-number">
        {FLIGHT_HOME.flight} <span className="flight-route">{FLIGHT_HOME.route}</span>
      </h3>

      <div className="flight-grid">
        <div className="flight-field">
          <span className="flight-key">Departure</span>
          <span className="flight-val">{FLIGHT_HOME.departureTime}</span>
        </div>
        <div className="flight-field">
          <span className="flight-key">Terminal</span>
          <span className="flight-val">{FLIGHT_HOME.terminal}</span>
        </div>
        <div className="flight-field flight-field-wide">
          <span className="flight-key">Rental Return</span>
          <span className="flight-val">{FLIGHT_HOME.carRentalReturn}</span>
        </div>
      </div>

      <ul className="flight-reminders">
        {FLIGHT_HOME.reminders.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </aside>
  )
}
