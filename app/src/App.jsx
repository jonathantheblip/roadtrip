import { useTheme } from './hooks/useTheme'
import { PersonSelector } from './components/PersonSelector'
import './styles/themes.css'
import './App.css'

export default function App() {
  const { activePerson, theme, setPerson } = useTheme()

  return (
    <main className="app">
      <header className="app-header">
        <h1>{theme.title}</h1>
        <p className="sub">{theme.subtitle}</p>
      </header>

      <PersonSelector active={activePerson} onChange={setPerson} />

      <section className="demo">
        <div className="demo-eyebrow">Theme preview · Step 2</div>
        <h2 className="demo-title">{theme.name}&rsquo;s view</h2>
        <p className="demo-pitch">
          Tap any person above to switch themes. The background, card
          treatment, typography, and button shapes all transform. Theme
          state persists in <code>localStorage</code> &mdash; refresh and it
          sticks. The theme-color meta tag updates too, so iOS standalone
          mode repaints the status bar.
        </p>

        <div className="swatch-row">
          <Swatch name="bg" token="--bg" />
          <Swatch name="card" token="--card" />
          <Swatch name="accent" token="--accent" />
          <Swatch name="accent 2" token="--accent2" />
        </div>

        <div className="demo-actions">
          <button className="btn-primary" type="button">
            Primary
          </button>
          <button className="btn-ghost" type="button">
            Ghost
          </button>
        </div>

        <footer className="demo-meta">
          <span>
            Font family: <code>{cssVarName(theme.key, 'font')}</code>
          </span>
          <span>
            Nav app: <code>{theme.navApp}</code>
          </span>
          <span>
            Radius: <code>{cssVarName(theme.key, 'radius')}</code>
          </span>
        </footer>
      </section>
    </main>
  )
}

function Swatch({ name, token }) {
  return (
    <div className="swatch" style={{ background: `var(${token})` }}>
      <span className="swatch-label">{name}</span>
    </div>
  )
}

// Small helper so the demo meta shows which token powers each surface,
// without runtime getComputedStyle noise.
function cssVarName(person, which) {
  const table = {
    jonathan: { font: 'DM Serif Display', radius: '14px' },
    helen: { font: 'Playfair Display', radius: '6px' },
    aurelia: { font: 'DM Sans (700)', radius: '16px' },
    rafa: { font: 'DM Sans (900)', radius: '4px' },
  }
  return table[person]?.[which] ?? '—'
}
