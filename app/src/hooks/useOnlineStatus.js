import { useCallback, useEffect, useState } from 'react'

export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [tileOk, setTileOk] = useState(online)

  const checkTile = useCallback(async () => {
    try {
      await fetch(
        'https://a.basemaps.cartocdn.com/light_all/0/0/0.png',
        { mode: 'no-cors', cache: 'no-store' }
      )
      setTileOk(true)
    } catch {
      setTileOk(false)
    }
  }, [])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      checkTile()
    }
    const goOffline = () => {
      setOnline(false)
      setTileOk(false)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    checkTile()

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [checkTile])

  return { isOnline: online && tileOk }
}
