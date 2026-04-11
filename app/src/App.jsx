import { useEffect, useState } from 'react'
import './styles/scaffold.css'

export default function App() {
  const [built, setBuilt] = useState(null)

  useEffect(() => {
    setBuilt(new Date().toLocaleString())
  }, [])

  return (
    <main className="scaffold">
      <div className="scaffold-card">
        <div className="scaffold-eyebrow">Road Trip PWA · v2 · React</div>
        <h1 className="scaffold-h1">Scaffold is alive.</h1>
        <p className="scaffold-p">
          You are looking at the React rebuild entry point. Vite is building to
          the <code>docs/</code> folder and GitHub Pages is serving it. The
          theme system, itinerary, media, and discover tabs will land in the
          next commits.
        </p>
        <ul className="scaffold-list">
          <li>✓ Vite + React 18 project structure</li>
          <li>✓ Build output → <code>../docs</code> with relative base</li>
          <li>✓ Service worker registered</li>
          <li>✓ Manifest linked</li>
          <li>○ Theme system — step 2</li>
          <li>○ Itinerary tab — step 3</li>
          <li>○ Media tab — steps 5 &amp; 6</li>
          <li>○ Discover tab — step 7</li>
        </ul>
        <div className="scaffold-meta">
          Client hydrated at <span className="mono">{built || '…'}</span>
        </div>
      </div>
    </main>
  )
}
