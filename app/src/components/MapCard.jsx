import { useCallback, useEffect, useRef, useState } from 'react'
import {
  wazeUrl,
  appleMapsUrl,
  googleMapsUrl,
  openTikTokSearch,
} from '../utils/navLinks'
import { ShareButton } from './ShareButton'
import './MapCard.css'

const PERSON_LABEL = {
  helen: 'Helen',
  aurelia: 'Aurelia',
  rafa: 'Rafa',
  jonathan: 'Jonathan',
  everyone: 'Everyone',
}

const TYPE_LABEL = {
  food: 'Food',
  energy: 'Energy',
  photo: 'Photo',
  poi: 'POI',
  gas: "Buc-ee's",
  viral: 'Viral',
}

export function MapCard({ stop, activePerson, onDismiss, mode }) {
  const [open, setOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const touchStart = useRef(null)
  const cardRef = useRef(null)

  useEffect(() => {
    if (stop) requestAnimationFrame(() => setOpen(true))
    else setOpen(false)
  }, [stop])

  const dismiss = useCallback(() => {
    setOpen(false)
    setTimeout(() => onDismiss?.(), 300)
  }, [onDismiss])

  const handleTouchStart = useCallback((e) => {
    touchStart.current = e.touches[0].clientY
    setDragging(true)
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (touchStart.current == null) return
    const dy = e.touches[0].clientY - touchStart.current
    if (dy > 0) setDragY(dy)
  }, [])

  const handleTouchEnd = useCallback(() => {
    setDragging(false)
    if (dragY > 100) {
      dismiss()
    }
    setDragY(0)
    touchStart.current = null
  }, [dragY, dismiss])

  if (!stop) return null

  const isPodcast = mode === 'media'

  return (
    <>
      <div className="map-card-backdrop" onClick={dismiss} />
      <div
        ref={cardRef}
        className={`map-card ${open ? 'open' : ''} ${dragging ? 'dragging' : ''}`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="map-card-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <span />
        </div>
        <div className="map-card-body">
          {isPodcast ? (
            <PodcastContent podcast={stop} />
          ) : (
            <StopContent stop={stop} activePerson={activePerson} />
          )}
        </div>
      </div>
    </>
  )
}

function StopContent({ stop, activePerson }) {
  return (
    <>
      <h3 className="map-card-name">
        {stop.name}
        {stop.star && <span className="star-badge">Top Pick</span>}
      </h3>

      <div className="tags">
        {stop.persons
          ?.filter((p) => p !== 'everyone')
          .map((p) => (
            <span key={p} className={`tag t-${p}`}>
              {PERSON_LABEL[p]}
            </span>
          ))}
        {stop.types?.map((t) => (
          <span key={t} className={`tag t-${t}`}>
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      <Pitches stop={stop} activePerson={activePerson} />

      {stop.vegNotes &&
        stop.vegNotes !== 'N/A' &&
        (activePerson === 'helen' || activePerson === 'everyone') && (
          <div className="map-card-meta">
            <strong>Vegetarian:</strong> {stop.vegNotes}
          </div>
        )}

      {stop.details && <div className="map-card-meta">{stop.details}</div>}

      <div className="map-card-actions">
        <NavBtn stop={stop} activePerson={activePerson} />
        {stop.menuUrl && (
          <a href={stop.menuUrl} target="_blank" rel="noopener">
            Menu
          </a>
        )}
        {stop.photosUrl && (
          <a href={stop.photosUrl} target="_blank" rel="noopener">
            Photos
          </a>
        )}
        {activePerson === 'aurelia' && (
          <button type="button" onClick={() => openTikTokSearch(stop.name)}>
            TikTok
          </button>
        )}
        <ShareButton stop={stop} activePerson={activePerson} variant="map" />
      </div>
    </>
  )
}

function Pitches({ stop, activePerson }) {
  const p = activePerson
  if (p === 'everyone') {
    return ['helen', 'aurelia', 'rafa', 'jonathan']
      .filter((k) => stop.pitch?.[k])
      .map((k) => (
        <div key={k} className="map-card-pitch">
          <strong>{PERSON_LABEL[k]}:</strong> {stop.pitch[k]}
        </div>
      ))
  }
  return (
    <>
      {stop.pitch?.[p] && (
        <div className="map-card-pitch">{stop.pitch[p]}</div>
      )}
      {['helen', 'aurelia', 'rafa', 'jonathan']
        .filter((k) => k !== p && stop.pitch?.[k])
        .slice(0, 1)
        .map((k) => (
          <div key={k} className="map-card-pitch secondary">
            <strong>{PERSON_LABEL[k]}:</strong> {stop.pitch[k]}
          </div>
        ))}
    </>
  )
}

function NavBtn({ stop, activePerson }) {
  if (!stop.address || stop.address === 'N/A') return null
  if (activePerson === 'jonathan') {
    return (
      <a href={wazeUrl(stop)} target="_blank" rel="noopener">
        Waze
      </a>
    )
  }
  if (activePerson === 'helen') {
    return (
      <a href={appleMapsUrl(stop.address)} target="_blank" rel="noopener">
        Apple Maps
      </a>
    )
  }
  return (
    <a href={googleMapsUrl(stop.address)} target="_blank" rel="noopener">
      Maps
    </a>
  )
}

function PodcastContent({ podcast }) {
  return (
    <>
      <div className="map-card-podcast-show">{podcast.show}</div>
      <div className="map-card-podcast-episode">{podcast.episode}</div>
      <div>
        <span className="map-card-podcast-duration">{podcast.duration}</span>
        {podcast.matchedStops && (
          <span className="map-card-podcast-match">
            📍 {podcast.matchedStops}
          </span>
        )}
      </div>
      <div className="map-card-pitch" style={{ marginTop: 8 }}>
        {podcast.pitch}
      </div>
      {podcast.isSeries && (
        <div className="map-card-meta">
          Series: {podcast.episodeCount} episodes · {podcast.totalDuration}
        </div>
      )}
      <div className="map-card-actions">
        <a href={podcast.applePodcastsUrl} target="_blank" rel="noopener">
          Apple Podcasts
        </a>
      </div>
    </>
  )
}
