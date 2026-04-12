import { useEffect, useState } from 'react'
import { shareStop } from '../utils/share'
import './ShareButton.css'

export function ShareButton({ stop, activePerson, variant = 'card' }) {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(id)
  }, [toast])

  const handle = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const result = await shareStop(stop, activePerson)
    if (result === 'copied') setToast('Copied to clipboard')
    else if (result === 'unavailable') setToast('Sharing unavailable')
  }

  const label = activePerson === 'aurelia' ? 'Share ✨' : null
  const cls = [
    'share-btn',
    `share-btn-${variant}`,
    `share-btn-${activePerson}`,
  ].join(' ')

  return (
    <>
      <button type="button" className={cls} onClick={handle} aria-label="Share">
        <span className="share-icon" aria-hidden="true">↗</span>
        {label && <span className="share-label">{label}</span>}
      </button>
      {toast && <div className="share-toast">{toast}</div>}
    </>
  )
}
