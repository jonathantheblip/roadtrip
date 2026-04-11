import { useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { PersonSelector } from './components/PersonSelector'
import { Navigation } from './components/Navigation'
import { ItineraryView } from './components/ItineraryView'
import { MediaView } from './components/MediaView'
import { DiscoverView } from './components/DiscoverView'
import './styles/themes.css'
import './App.css'

export default function App() {
  const { activePerson, theme, setPerson } = useTheme()
  const [activeTab, setActiveTab] = useState('itinerary')

  // Scroll the content back to the top when the user switches tabs or
  // persons so they land on the fresh view instead of stranded mid-page.
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePersonChange = (p) => {
    setPerson(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>{theme.title}</h1>
        <p className="sub">{theme.subtitle}</p>
      </header>

      <div className="sticky-nav">
        <PersonSelector active={activePerson} onChange={handlePersonChange} />
        <Navigation active={activeTab} onChange={handleTabChange} />
      </div>

      <div className="tab-content" key={`${activeTab}-${activePerson}`}>
        {activeTab === 'itinerary' && (
          <ItineraryView activePerson={activePerson} />
        )}
        {activeTab === 'media' && <MediaView activePerson={activePerson} />}
        {activeTab === 'discover' && <DiscoverView activePerson={activePerson} />}
      </div>
    </main>
  )
}
