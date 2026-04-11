import { YouTubeSection } from './YouTubeSection'
import { PodcastSection } from './PodcastSection'
import { JonathanQueue } from './JonathanQueue'
import { YOUTUBE_RAFA, YOUTUBE_AURELIA } from '../data/youtube'

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

  // Jonathan — his own audio-drama / fiction queue, not route-matched.
  return <JonathanQueue />
}
