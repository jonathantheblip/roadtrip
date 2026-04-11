import { useMemo } from 'react'
import { PODCASTS, PODCAST_REGIONS } from '../data/podcasts'
import './PodcastSection.css'

// Deterministic colored initials for the show artwork placeholder.
function showInitials(show) {
  return show
    .replace(/\([^)]*\)/g, '') // drop parenthetical network/label
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter((c) => /[A-Za-z0-9]/.test(c))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Hash a string to an HSL hue in the warm/cool range that works
// across Helen's light theme, so every show gets its own tile color.
function showHue(show) {
  let h = 0
  for (let i = 0; i < show.length; i++) h = (h * 31 + show.charCodeAt(i)) % 360
  return h
}

export function PodcastSection() {
  const grouped = useMemo(() => {
    const acc = {}
    PODCASTS.forEach((p) => {
      if (!acc[p.region]) acc[p.region] = []
      acc[p.region].push(p)
    })
    return acc
  }, [])

  return (
    <article className="podcast-section">
      <header className="podcast-intro">
        <div className="podcast-eyebrow">Listen</div>
        <h2 className="podcast-title">Route-matched episodes</h2>
        <p className="podcast-lede">
          {PODCASTS.length} episodes tied to specific stops and regions on
          the drive. No generic recommendation list — every entry earned
          its place by matching a place we&rsquo;re passing through.
        </p>
      </header>

      {PODCAST_REGIONS.map((region) => {
        const items = grouped[region.key]
        if (!items || items.length === 0) return null
        return (
          <section key={region.key} className="podcast-region">
            <div className="podcast-region-header">
              <h3 className="podcast-region-title">{region.title}</h3>
              <p className="podcast-region-blurb">{region.blurb}</p>
            </div>
            <div className="podcast-cards">
              {items.map((ep) => (
                <PodcastCard key={ep.id} ep={ep} />
              ))}
            </div>
          </section>
        )
      })}
    </article>
  )
}

function PodcastCard({ ep }) {
  const hue = showHue(ep.show)
  const initials = showInitials(ep.show)

  return (
    <a
      className="podcast-card"
      href={ep.applePodcastsUrl}
      target="_blank"
      rel="noopener"
    >
      <div
        className="podcast-artwork"
        style={{
          background: `linear-gradient(140deg, hsl(${hue} 45% 78%), hsl(${(hue + 30) % 360} 35% 62%))`,
        }}
      >
        <span className="podcast-artwork-initials">{initials}</span>
      </div>

      <div className="podcast-body">
        <div className="podcast-card-meta">
          <span className="podcast-show">{ep.show}</span>
          <span className="podcast-duration">{ep.duration}</span>
        </div>
        <h4 className="podcast-episode">{ep.episode}</h4>
        {ep.isSeries && (
          <div className="podcast-series-badge">
            Series · {ep.episodeCount} episodes · {ep.totalDuration}
          </div>
        )}
        <p className="podcast-pitch">{ep.pitch}</p>
        <div className="podcast-footer">
          <span className="podcast-for">
            <span className="for-label">For:</span> {ep.matchedStops}
          </span>
          <span className="podcast-cta">Apple Podcasts →</span>
        </div>
      </div>
    </a>
  )
}
