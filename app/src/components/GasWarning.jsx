import './GasWarning.css'

export function GasWarning({ warning }) {
  if (!warning) return null
  return (
    <div className="gas-warning" role="note">
      <span className="gas-icon" aria-hidden="true">
        {'\u26FD'}
      </span>
      <div className="gas-body">
        <div className="gas-headline">
          {warning.miles} miles between stops &middot; {warning.route}
        </div>
        <div className="gas-note">{warning.note}</div>
      </div>
    </div>
  )
}
