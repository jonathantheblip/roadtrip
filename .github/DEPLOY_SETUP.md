# Worker deploy pipeline — one-time setup (Jonathan)

The workflow `.github/workflows/deploy-worker.yml` deploys the worker
(`roadtrip-sync`) automatically, but **only after** the worker test suite
and the full e2e suite (chromium + webkit-mobile) both pass. It does the
parts that are NOT yours; the two steps below ARE yours (web UI only — no
terminal, and I never have the token).

---

## Step 1 — Create a Cloudflare API token

In the **Cloudflare dashboard** → **My Profile → API Tokens → Create Token**:

- Easiest: use the **"Edit Cloudflare Workers"** template (it includes
  *Workers Scripts: Edit* plus the resource permissions for the D1 / R2
  bindings this worker declares — no guesswork).
- Minimum required: **Account → Workers Scripts → Edit**.
- **Account Resources:** scope it to **the account that owns `roadtrip-sync`**
  (the same account that holds the `roadtrip-db` D1 and `roadtrip-assets` R2).

Copy the token value once (you can't view it again).

Also grab your **Account ID**: Cloudflare dashboard → **Workers & Pages** →
the **Account ID** shown in the right sidebar (or it's in the dashboard URL).

> The CI deploy needs ONLY these two values. It does **not** need the worker's
> runtime secrets (the 4 `FAMILY_TOKEN_*`, `GOOGLE_PLACES_API_KEY`,
> `CALENDAR_IMPORT_TOKEN`) — those already live on the deployed worker and
> `wrangler deploy` preserves them across deploys. Don't re-add them here.

---

## Step 2 — Add the two repo secrets (GitHub web UI)

Repo on GitHub → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Add **both**, names spelled EXACTLY as the
workflow references them (a typo means the deploy step can't authenticate):

| Secret name (exact)     | Value                                            |
|-------------------------|--------------------------------------------------|
| `CLOUDFLARE_API_TOKEN`  | the API token from Step 1                        |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare Account ID from Step 1            |

(`CLOUDFLARE_ACCOUNT_ID` is required because `account_id` is **not** in
`worker/wrangler.toml`, and `wrangler deploy` in CI can't auto-detect the
account — this is exactly what failed `wrangler whoami` locally.)

Paste each value → **Add secret**. The workflow file contains only
`${{ secrets.* }}` references — never the values.

---

## Step 3 — Trigger the first deploy (makes Vermont's hero go live)

The worker code with the trip-hero resolver is already committed on `main`
(`9ebe75c`), and Vermont's destination is already set to `Peru, VT`. It just
needs a deploy to go live. After Step 2, trigger the gated pipeline **either** way:

- **Manual (recommended for the first run):** GitHub → **Actions** tab →
  **Deploy Worker** → **Run workflow** → branch `main` → **Run workflow**.
  This runs both test suites against current `main` and, if green, deploys.
- **Or a `worker/**` touch:** make any change under `worker/` (even a comment)
  and push to `main` — the `paths: worker/**` filter fires the same gated run.

> Adding the workflow file itself does **not** trigger a deploy (it's under
> `.github/`, not `worker/**`), so nothing deploys until you do one of the above.

**Proof the pipeline works:** after a green run deploys, the next `GET /trips`
pull triggers the worker's background resolver for Vermont (`Peru, VT`, no
explicit hero) → it fetches a Places photo, stores it to R2, and the card
upgrades off the floor on the following pull. (Peru, VT is tiny, so the
resolved photo may look generic — expected, not a bug.)

---

## Notes / gotchas

- **Runner is `macos-latest` on purpose.** The committed Playwright visual
  baselines are platform-suffixed `-darwin` (36 of them, zero `-linux`).
  Playwright resolves baselines by OS, so a Linux runner would fail on
  missing `-linux` baselines. macOS matches the baselines.
  - *Residual risk:* if the GitHub macOS runner's font anti-aliasing differs
    from the Mac the baselines were captured on, the visual baselines could
    fail on the first CI run (same class of AA drift fixed in `b277f02`). If
    that happens, re-bless on the runner's platform (download the run's diff
    artifacts, or regenerate with `--update-snapshots` on a matching macOS),
    or drop `visual-baselines.spec.js` from the CI gate and keep it as a
    local check. The functional specs are platform-agnostic.
  - macOS runners bill at a higher minute multiplier than Linux, but this
    gate only runs on `worker/**` pushes (infrequent), so cost is minimal.
- **The gate is the test suites, not tree cleanliness.** A full e2e run
  rewrites `app/tests/e2e/screenshots/*.png` (custom captures), which are now
  gitignored/untracked, so they don't dirty the CI tree.
