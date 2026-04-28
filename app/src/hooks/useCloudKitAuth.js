import { useCallback, useEffect, useRef, useState } from 'react'
import { getContainer, getCurrentUser, isCloudKitConfigured } from '../lib/cloudkit'

// useCloudKitAuth — small hook around CloudKit JS auth.
// State machine:
//   'idle'      → not yet checked
//   'loading'   → CloudKit JS loading or setUpAuth in flight
//   'signedOut' → loaded, no user
//   'signedIn'  → loaded, user available
//   'error'     → fetch / config failure
//
// Calling `signIn()` triggers CloudKit's sign-in flow. The hook
// transitions to 'signedIn' once the user resolves (CloudKit fires
// `onAuthenticated` listeners on the container).

export function useCloudKitAuth() {
  const [state, setState] = useState(isCloudKitConfigured() ? 'idle' : 'unconfigured')
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!isCloudKitConfigured()) {
      setState('unconfigured')
      return
    }
    setState('loading')
    setError(null)
    try {
      const container = await getContainer()
      containerRef.current = container
      const u = await getCurrentUser()
      if (!u) {
        setState('error')
        setError('CloudKit unreachable')
        return
      }
      if (u.signedIn) {
        setUser(u.userIdentity)
        setState('signedIn')
      } else {
        setUser(null)
        setState('signedOut')
      }
    } catch (err) {
      console.error('useCloudKitAuth refresh failed', err)
      setState('error')
      setError(err?.message || String(err))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Wire CloudKit's auth listeners so external sign-ins (e.g. opening
  // the Sign in button in another tab) flip the local state.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onIn = (userInfo) => {
      setUser(userInfo)
      setState('signedIn')
    }
    const onOut = () => {
      setUser(null)
      setState('signedOut')
    }
    container.whenUserSignsIn().then(onIn).catch(() => {})
    container.whenUserSignsOut().then(onOut).catch(() => {})
  }, [state])

  const signIn = useCallback(async () => {
    if (!containerRef.current) return
    try {
      // CloudKit JS exposes setUpAuth which returns a userInfo or null.
      // If null, the user needs to sign in via the dashboard's button —
      // we redirect through container.signIn() if available, else surface
      // a hint.
      if (typeof containerRef.current.signIn === 'function') {
        await containerRef.current.signIn()
      }
      await refresh()
    } catch (err) {
      console.error('CloudKit signIn failed', err)
      setError(err?.message || String(err))
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    if (!containerRef.current) return
    try {
      if (typeof containerRef.current.signOut === 'function') {
        await containerRef.current.signOut()
      }
      setUser(null)
      setState('signedOut')
    } catch (err) {
      console.error('CloudKit signOut failed', err)
    }
  }, [])

  return { state, user, error, signIn, signOut, refresh }
}
