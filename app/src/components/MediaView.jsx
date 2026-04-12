import { useMemo } from 'react'
import { YouTubeSection } from './YouTubeSection'
import { PodcastSection } from './PodcastSection'
import { JonathanQueue } from './JonathanQueue'
import { YOUTUBE_RAFA, YOUTUBE_AURELIA } from '../data/youtube'
import { PODCASTS } from '../data/podcasts'
import { PODCAST_REGION_COORDS } from '../data/route'
import { RouteMapLazy } from './RouteMapLazy'

export function MediaView({ activePerson }) {
  if (activePerson === 'rafa') {
    return <YouTubeSection data={YOUTUBE_RAFA} />
  }

  if (activePerson === 'aurelia') {
    return <YouTubeSection data={YOUTUBE_AURELIA} />
  }

  if (activePerson === 'helen') {
    return <PodcastMediaView />
  }

  return <JonathanQueue />
}

function PodcastMediaView() {
  const podcastStops = useMemo(() => {
    return PODCASTS.map((p, i) => {
      const coords = PODCAST_REGION_COORDS[p.region] || [36, -85]
      const jitter = i * 0.04
      return {
        ...p,
        lat: coords[0] + jitter * 0.3,
        lng: coords[1] + jitter * 0.2,
        types: ['poi'],
        persons: ['helen', 'everyone'],
        name: p.show,
      }
    })
  }, [])

  return (
    <>
      <RouteMapLazy mode="media" stops={podcastStops} activePerson="helen" />
      <PodcastSection />
    </>
  )
}
