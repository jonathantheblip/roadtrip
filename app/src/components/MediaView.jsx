import { YouTubeSection } from './YouTubeSection'
import { PodcastSection } from './PodcastSection'
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
    return <PodcastSection />
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
