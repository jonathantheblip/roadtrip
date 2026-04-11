import './PlaceholderView.css'

export function DiscoverView() {
  return (
    <section className="placeholder-view">
      <div className="placeholder-eyebrow">Discover · step 7</div>
      <h2>Browse by state</h2>
      <p>
        Discover tab is a placeholder during step 3. State selector and the
        full browse-and-discover POI set (54 entries across CT, NY, PA, VA,
        TN, AL, MS, LA, TX) land in step 7. Data is already in{' '}
        <code>src/data/stops.js</code> with <code>category: &lsquo;discover&rsquo;</code>.
      </p>
    </section>
  )
}
