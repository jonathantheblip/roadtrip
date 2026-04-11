import { JONATHAN_QUEUE } from '../data/jonathan_podcasts'
import './JonathanQueue.css'

export function JonathanQueue() {
  const totalShows = JONATHAN_QUEUE.sections.reduce(
    (acc, s) => acc + s.items.length,
    0
  )

  return (
    <article className="jq">
      <header className="jq-intro">
        <div className="jq-eyebrow">{JONATHAN_QUEUE.eyebrow}</div>
        <h2 className="jq-title">{JONATHAN_QUEUE.title}</h2>
        <p className="jq-lede">{JONATHAN_QUEUE.lede}</p>
        <div className="jq-count">
          {totalShows} shows across {JONATHAN_QUEUE.sections.length} categories
        </div>
      </header>

      {JONATHAN_QUEUE.sections.map((section) => (
        <section key={section.key} className="jq-section">
          <h3 className="jq-section-title">
            {section.title}
            {section.subtitle && (
              <span className="jq-section-subtitle">&middot; {section.subtitle}</span>
            )}
          </h3>
          <ul className="jq-items">
            {section.items.map((item, i) => (
              <li key={i}>
                <a
                  className="jq-row"
                  href={item.url}
                  target="_blank"
                  rel="noopener"
                >
                  <div className="jq-row-header">
                    <span className="jq-show">{item.show}</span>
                    <span className="jq-cta">Overcast &rarr;</span>
                  </div>
                  <p className="jq-pitch">{item.pitch}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
