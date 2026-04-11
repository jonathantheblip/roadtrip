import './PlaceholderView.css'

export function MediaView({ activePerson }) {
  return (
    <section className="placeholder-view">
      <div className="placeholder-eyebrow">Media · step 5–6</div>
      <h2>
        {activePerson === 'rafa' && 'WATCH ON THE ROAD 🦖🕷🔥'}
        {activePerson === 'aurelia' && 'watch list ✨'}
        {activePerson === 'helen' && 'Listen'}
        {activePerson === 'jonathan' && 'No media feed'}
      </h2>
      <p>
        Media tab is a placeholder during step 3. YouTube categories for
        Rafa and Aurelia land in step 5, and Helen&rsquo;s route-matched
        podcast episodes land in step 6. Jonathan uses Overcast and
        won&rsquo;t see a feed here at all.
      </p>
    </section>
  )
}
