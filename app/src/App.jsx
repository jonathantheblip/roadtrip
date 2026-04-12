import { useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { PersonSelector } from './components/PersonSelector'
import { BottomNav } from './components/BottomNav'
import { ItineraryView } from './components/ItineraryView'
import { MediaView } from './components/MediaView'
import { DiscoverView } from './components/DiscoverView'
import './styles/themes.css'
import './App.css'

export default function App() {
  const { activePerson, theme, setPerson } = useTheme()
  const [activeTab, setActiveTab] = useState('itinerary')

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
    <main className="app">
      <header className="top-bar">
        <div className="top-bar-title">
          <h1>{theme.title}</h1>
          <p className="top-bar-sub">{theme.subtitle}</p>
        </div>
        <PersonSelector active={activePerson} onChange={handlePersonChange} />
      </header>

      <div className="view-inner" key={`${activeTab}-${activePerson}`}>
        {activeTab === 'itinerary' && (
          <ItineraryView activePerson={activePerson} />
        )}
        {activeTab === 'media' && <MediaView activePerson={activePerson} />}
        {activeTab === 'discover' && (
          <DiscoverView activePerson={activePerson} />
        )}
      </div>

      <BottomNav active={activeTab} onChange={handleTabChange} />
    </main>
  )
}
