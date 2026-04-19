import { useEffect, useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { useVisited } from './hooks/useVisited'
import { VisitedContext } from './hooks/VisitedContext'
import { PersonSelector } from './components/PersonSelector'
import { BottomNav } from './components/BottomNav'
import { NavBar } from './components/NavBar'
import { EmergencyFab } from './components/EmergencyFab'
import { ItineraryView } from './components/ItineraryView'
import { MediaView } from './components/MediaView'
import { DiscoverView } from './components/DiscoverView'
import { TripView } from './components/TripView'
import { DayOrientationBanner } from './components/DayOrientationBanner'
import './styles/themes.css'
import './App.css'

const VALID_TABS = ['itinerary', 'media', 'discover', 'trip']

// Read the initial tab from the ?tab= query param so a saved
// Add-to-Home-Screen URL remembers where the user was. Fall back
// to Itinerary.
function initialTab() {
  try {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    if (t && VALID_TABS.includes(t)) return t
  } catch {
    /* ignore */
  }
  return 'itinerary'
}

export default function App() {
  const { activePerson, theme, setPerson } = useTheme()
  const [activeTab, setActiveTab] = useState(initialTab)
  const visitedState = useVisited()

  // Mirror the active tab in the ?tab= query string via replaceState
  // so a home-screen save captures the current tab too.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab)
        window.history.replaceState(null, '', url.toString())
      }
    } catch {
      /* older browsers */
    }
  }, [activeTab])

  // Scroll the window back to the top when the user switches tabs or
  // persons so they land on the fresh view from the top. We let the
  // body scroll (not a nested container) so position: sticky on the
  // top bar actually works.
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const handlePersonChange = (p) => {
    setPerson(p)
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <VisitedContext.Provider value={visitedState}>
    <main className="app">
      <header className="top-bar">
        <div className="top-bar-title">
          <h1>{theme.title}</h1>
          <p className="top-bar-sub">{theme.subtitle}</p>
        </div>
        <PersonSelector active={activePerson} onChange={handlePersonChange} />
      </header>

      <DayOrientationBanner
        onTap={() => {
          setActiveTab('itinerary')
          requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
        }}
      />

      <div className="view-inner" key={`${activeTab}-${activePerson}`}>
        {activeTab === 'itinerary' && (
          <ItineraryView activePerson={activePerson} />
        )}
        {activeTab === 'media' && <MediaView activePerson={activePerson} />}
        {activeTab === 'discover' && (
          <DiscoverView activePerson={activePerson} />
        )}
        {activeTab === 'trip' && (
          <TripView activePerson={activePerson} />
        )}
      </div>

      <NavBar activePerson={activePerson} visible={activeTab === 'itinerary'} />
      <EmergencyFab activePerson={activePerson} />
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </main>
    </VisitedContext.Provider>
  )
}
