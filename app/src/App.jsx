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

  // Scroll the scroll container back to the top when the user switches
  // tabs or persons so they land on the fresh view from the top.
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    // Small delay so state commits before scrolling
    requestAnimationFrame(() => {
      const sc = document.getElementById('scroll-area')
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const handlePersonChange = (p) => {
    setPerson(p)
    requestAnimationFrame(() => {
      const sc = document.getElementById('scroll-area')
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' })
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

      <div
        className="scroll-area"
        id="scroll-area"
        key={`${activeTab}-${activePerson}`}
      >
        <div className="view-inner">
          {activeTab === 'itinerary' && (
            <ItineraryView activePerson={activePerson} />
          )}
          {activeTab === 'media' && <MediaView activePerson={activePerson} />}
          {activeTab === 'discover' && (
            <DiscoverView activePerson={activePerson} />
          )}
        </div>
      </div>

      <BottomNav active={activeTab} onChange={handleTabChange} />
    </main>
  )
}
