import './YouTubeSection.css'

export function YouTubeSection({ data }) {
  return (
    <article className="media-section">
      <h2 className="media-title">{data.title}</h2>
      {data.categories.map((cat, i) => (
        <div key={i} className="media-category">
          <h3 className="media-category-title">{cat.title}</h3>
          {cat.items.length > 0 && (
            <div className="media-links">
              {cat.items.map((item, j) => (
                <a
                  key={j}
                  className="media-link"
                  href={item.url}
                  target="_blank"
                  rel="noopener"
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
          {cat.note && <p className="media-note">{cat.note}</p>}
        </div>
      ))}
    </article>
  )
}
