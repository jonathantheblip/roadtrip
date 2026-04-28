// CloudKit JS loader + configuration. Spec §4 (Memory schema lives in
// the iCloud.com.jacksonfamily.trips container).
//
// CloudKit JS is loaded from Apple's CDN on demand (rather than at app
// boot) so the bundle stays small and the network request only fires
// when the user reaches a surface that needs sync (Settings sign-in
// button, or first save after sign-in).
//
// Apple's "Web Service" API token is intended to ship in client code —
// access is gated by registered domains in the CloudKit dashboard. The
// token + container id are exposed via VITE_-prefixed env vars; the
// Sign in with Apple Service ID is included for the sign-in flow.

const CDN_SRC = 'https://cdn.apple-cloudkit.com/ck/2/cloudkit.js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
const CONTAINER = env.VITE_CLOUDKIT_CONTAINER || ''
const API_TOKEN = env.VITE_CLOUDKIT_API_TOKEN || ''
const SERVICE_ID = env.VITE_CLOUDKIT_SERVICE_ID || ''
const ENVIRONMENT = env.VITE_CLOUDKIT_ENV || 'development'

let loadPromise = null
let configured = false
let containerHandle = null

export function isCloudKitConfigured() {
  return !!(CONTAINER && API_TOKEN)
}

// Lazy-load CloudKit JS. Resolves with `window.CloudKit` once ready.
// Multiple callers share a single in-flight script load.
export function loadCloudKit() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.CloudKit) return Promise.resolve(window.CloudKit)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CDN_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.CloudKit))
      existing.addEventListener('error', () => reject(new Error('cloudkit script failed')))
      return
    }
    const s = document.createElement('script')
    s.src = CDN_SRC
    s.async = true
    s.onload = () => {
      if (window.CloudKit) resolve(window.CloudKit)
      else reject(new Error('cloudkit not on window after load'))
    }
    s.onerror = () => reject(new Error('cloudkit script failed'))
    document.head.appendChild(s)
  })
  loadPromise.catch(() => {
    loadPromise = null
  })
  return loadPromise
}

// Get the configured CloudKit container, lazy-configuring on first use.
// Throws (rejects) if env vars are missing.
export async function getContainer() {
  if (containerHandle) return containerHandle
  if (!isCloudKitConfigured()) {
    throw new Error('CloudKit not configured — VITE_CLOUDKIT_CONTAINER / VITE_CLOUDKIT_API_TOKEN missing')
  }
  const CK = await loadCloudKit()
  if (!configured) {
    CK.configure({
      containers: [
        {
          containerIdentifier: CONTAINER,
          apiTokenAuth: {
            apiToken: API_TOKEN,
            persist: true,
            // Pass the Sign in with Apple service id when present;
            // CloudKit JS uses it for the OAuth handshake.
            ...(SERVICE_ID ? { signInButton: { id: 'apple-sign-in', theme: 'black' } } : {}),
          },
          environment: ENVIRONMENT,
        },
      ],
      services: SERVICE_ID
        ? {
            fetch: (url, opts) => fetch(url, opts),
          }
        : undefined,
    })
    configured = true
  }
  containerHandle = CK.getDefaultContainer()
  return containerHandle
}

// Convenience: returns { signedIn, userRecordName, userIdentity }.
// Throws on auth/transport failure so callers can surface the real
// reason (origin not whitelisted, third-party cookies blocked, etc.)
// instead of papering over it with a generic "unreachable" message.
export async function getCurrentUser() {
  const container = await getContainer()
  const userInfo = await container.setUpAuth()
  if (!userInfo) return { signedIn: false }
  return {
    signedIn: true,
    userRecordName: userInfo.userRecordName,
    userIdentity: userInfo,
  }
}

export const CLOUDKIT_META = {
  container: CONTAINER,
  serviceId: SERVICE_ID,
  environment: ENVIRONMENT,
}
