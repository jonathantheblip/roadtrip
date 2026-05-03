import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/reset.css'
import './styles/themes.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register the service worker and auto-reload on activation of a new one.
// This is the standard PWA update flow: install → activate → controllerchange
// → reload, so installed phones always pick up the latest bundle on next open.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // iOS Safari throttles its implicit sw.js update check to as much
        // as 24h, which strands installed PWAs on whatever bundle they
        // first installed. Force an explicit check on every cold launch,
        // and again every 30 minutes while the app stays open, so a push
        // reaches every family member's phone within the next session.
        reg.update().catch(() => {})
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)

        // If an update is found while we're running, force it to activate
        // immediately so the user doesn't have to close and reopen twice.
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {})

    // When the controller changes (new SW took over), reload once so the
    // fresh bundle is actually what's running.
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  })
}
