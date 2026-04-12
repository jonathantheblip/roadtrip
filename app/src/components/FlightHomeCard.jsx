import { FLIGHT_HOME } from '../data/overnight'
import './FlightHomeCard.css'

export function FlightHomeCard() {
  const { departure, arrival, travelers } = FLIGHT_HOME
  return (
    <aside className="flight-card" aria-label="Flight home">
      <div className="flight-eyebrow">Flight Home · {FLIGHT_HOME.date}</div>

      <h3 className="flight-number">
        {FLIGHT_HOME.flight}{' '}
        <span className="flight-route">{FLIGHT_HOME.route}</span>
      </h3>

      <div className="flight-legs">
        <div className="flight-leg">
          <span className="flight-leg-label">Depart</span>
          <span className="flight-leg-time">{departure.time}</span>
          <span className="flight-leg-airport">
            {departure.airport} · Terminal {departure.terminal}
          </span>
          <span className="flight-leg-city">{departure.city}</span>
        </div>
        <div className="flight-leg-arrow" aria-hidden="true">
          →
        </div>
        <div className="flight-leg">
          <span className="flight-leg-label">Arrive</span>
          <span className="flight-leg-time">{arrival.time}</span>
          <span className="flight-leg-airport">
            {arrival.airport} · Terminal {arrival.terminal}
          </span>
          <span className="flight-leg-city">{arrival.city}</span>
        </div>
      </div>

      <div className="flight-grid">
        <div className="flight-field">
          <span className="flight-key">Confirmation</span>
          <span className="flight-val">{FLIGHT_HOME.confirmation}</span>
        </div>
        <div className="flight-field">
          <span className="flight-key">Airline</span>
          <span className="flight-val">{FLIGHT_HOME.airline}</span>
        </div>
        <div className="flight-field flight-field-wide">
          <span className="flight-key">Rental Return</span>
          <span className="flight-val">{FLIGHT_HOME.carRental}</span>
        </div>
      </div>

      <div className="flight-travelers">
        <div className="flight-travelers-label">Seats</div>
        <ul className="flight-travelers-list">
          {travelers.map((t) => (
            <li key={t.name}>
              <span className="flight-traveler-name">{t.name}</span>
              <span className="flight-traveler-seat">{t.seat}</span>
            </li>
          ))}
        </ul>
        {FLIGHT_HOME.seatingNote && (
          <p className="flight-seating-note">{FLIGHT_HOME.seatingNote}</p>
        )}
      </div>

      <ul className="flight-reminders">
        {FLIGHT_HOME.reminders.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </aside>
  )
}
