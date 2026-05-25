// Cross-browser network throttling helpers.
//
// Chromium has CDP for true `Network.emulateNetworkConditions`,
// but WebKit-mobile doesn't. To keep both projects exercising the
// same matrix, these helpers use Playwright's portable route()
// interceptor with deterministic per-request delays. Crude, but
// it stresses the same code paths the user sees on a real slow
// network: requests take longer, responses arrive in chunks,
// queue drain behavior surfaces.
//
// All three helpers attach to the Worker host only — the dev
// server itself isn't throttled, so app boot stays fast.

const WORKER_HOST_RE =
  /\/\/roadtrip-sync\.jonathan-d-jackson\.workers\.dev\//

// Add a fixed pre-flight delay to every Worker request, modeling
// the high-latency leg of a slow cellular link. ~600ms aligns
// with the slow 3G round trip Playwright's old CDP preset used
// (Latency 562ms; RTT 400ms is the spec's effective network type
// SLOW_3G).
export async function slow3G(page, opts = {}) {
  const latencyMs = opts.latencyMs ?? 600
  await page.route(WORKER_HOST_RE, async (route) => {
    await new Promise((r) => setTimeout(r, latencyMs))
    await route.continue()
  })
}

// Drop to offline after the first N matching requests have
// fired. Models "I was uploading and lost signal halfway
// through." The first request still gets through (so the
// upload has a chance to start); subsequent requests fail
// until the test flips context.setOffline(false).
//
// `kindMatcher` defaults to upload routes (POST /assets/...).
// Adjust if a test needs to count something else.
export async function dropAfterNUploads(
  page,
  context,
  n,
  kindMatcher = /\/assets\/(?:photo|video)/
) {
  let seen = 0
  await page.route(WORKER_HOST_RE, async (route) => {
    const url = route.request().url()
    if (kindMatcher.test(url)) {
      seen += 1
      if (seen > n) {
        await context.setOffline(true)
        await route.abort('internetdisconnected')
        return
      }
    }
    await route.continue()
  })
  return { seen: () => seen }
}

// Connection-drop-and-resume — abort the first matching request
// once, then transparently allow retries. Models a transient
// cellular hiccup that recovers on a single retry.
export async function dropFirstThenResume(
  page,
  kindMatcher = /\/assets\/(?:photo|video)/
) {
  let dropped = false
  await page.route(WORKER_HOST_RE, async (route) => {
    const url = route.request().url()
    if (!dropped && kindMatcher.test(url)) {
      dropped = true
      await route.abort('internetdisconnected')
      return
    }
    await route.continue()
  })
  return { dropped: () => dropped }
}
