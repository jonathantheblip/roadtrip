import { YouTubeSection } from './YouTubeSection'
import { YOUTUBE_RAFA, YOUTUBE_AURELIA } from '../data/youtube'
import './PlaceholderView.css'

export function MediaView({ activePerson }) {
  if (activePerson === 'rafa') {
    return <YouTubeSection data={YOUTUBE_RAFA} />
  }

  if (activePerson === 'aurelia') {
    return <YouTubeSection data={YOUTUBE_AURELIA} />
  }

  if (activePerson === 'helen') {
    return (
      <section className="placeholder-view">
        <div className="placeholder-eyebrow">Listen · step 6</div>
        <h2>Route-matched podcast episodes</h2>
        <p>
          Helen&rsquo;s podcast list lands in step 6. 26 episodes tied to
          specific stops on the drive: Hudson Valley art, PA coal country,
          Virginia history, East Tennessee, Birmingham, Mississippi,
          Fort Worth, Houston. No generic recommendation lists.
        </p>
      </section>
    )
  }

  // Jonathan
  return (
    <section className="placeholder-view placeholder-quiet">
      <div className="placeholder-eyebrow">Media</div>
      <h2>Nothing here for you.</h2>
      <p>
        Media is for the kids and Helen. You run Overcast already &mdash;
        find your own stuff.
      </p>
    </section>
  )
}
