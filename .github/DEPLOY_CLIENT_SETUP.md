# Client deploy pipeline — one-time setup (Jonathan)

The workflow `.github/workflows/deploy-client.yml` builds the PWA client
(`app/`) and publishes it to GitHub Pages automatically — but **only after**
the full e2e suite (chromium + webkit-mobile) passes. It replaces the old
hand-built-and-committed `docs/` flow that caused the Vermont stale-bundle
incident: the build artifact is now published straight to Pages and is **no
longer committed to the repo**.

This is the model where **Pages Source = "GitHub Actions"** (not the
`main` / `docs` folder). The steps below are the parts that are yours — they
need the GitHub web UI (the local push credential can't create workflow files,
and I never touch your Pages settings or secrets).

---

## ⚠️ Ordering matters — doing this out of order takes the live site down

`docs/` must NOT be untracked from git while Pages is still serving the
`docs/` **folder**. Pulling the folder out from under a folder-served site
removes the live content. The safe order is:

1. **Create the workflow file** on `main` (Step 1 — web-UI paste).
2. **Add the build env** (Step 2 — Variable + Secrets).
3. **Flip Pages Source → GitHub Actions** (Step 3).
4. **Run the first deploy and confirm the site is live** (Step 4).
5. **Only then** untrack `docs/` (Step 5 — I run this, after you confirm 1–4).

Steps 1–4 are reversible and never take the site down (folder-serving stays
live until the first Actions deploy supersedes it). Step 5 is the point of no
return, which is why I won't run it until you confirm 1–4 are done.

---

## Step 1 — Create the workflow file (web UI)

The local push credential lacks the GitHub `workflow` scope, so I can't push
`.github/workflows/*`. Create it by hand:

GitHub repo → **Add file → Create new file** → name it exactly
`.github/workflows/deploy-client.yml` → paste the contents I printed in chat →
**Commit directly to `main`**.

(That commit only touches `.github/`, which doesn't match the `app/**` paths
filter, so it does **not** trigger a deploy by itself — you trigger the first
one manually in Step 4.)

---

## Step 2 — Add the build env (one Variable + four Secrets)

These are the client-public `VITE_*` build constants the bundle needs, or it
ships sync-disabled (the exact Vermont failure). Repo → **Settings** →
**Secrets and variables** → **Actions**. Spell every name EXACTLY as the
workflow references it.

**Variables tab → New repository variable:**

| Variable name (exact) | Value |
|-----------------------|-------|
| `VITE_WORKER_URL`     | `https://roadtrip-sync.jonathan-d-jackson.workers.dev` |

**Secrets tab → New repository secret** (values are in the repo-root `.env`,
gitignored — copy each across; do not paste them anywhere public):

| Secret name (exact)          | Value                              |
|------------------------------|------------------------------------|
| `VITE_FAMILY_TOKEN_JONATHAN` | the matching value in repo-root `.env` |
| `VITE_FAMILY_TOKEN_HELEN`    | the matching value in repo-root `.env` |
| `VITE_FAMILY_TOKEN_AURELIA`  | the matching value in repo-root `.env` |
| `VITE_FAMILY_TOKEN_RAFA`     | the matching value in repo-root `.env` |

> The URL is a **Variable** (non-sensitive, nice to see in logs). The four
> tokens are **Secrets** (bearer tokens — Secrets gives free log-masking, and
> it matches the worker pipeline's convention). They're "public" only in that
> they already ship inside the bundle; keeping them as Secrets costs nothing.
> These are **separate** from the worker's runtime secrets — don't confuse them.

---

## Step 3 — Flip Pages Source to GitHub Actions

Repo → **Settings** → **Pages** → **Build and deployment** → **Source**.

- **First, note what it says now** (expected: *Deploy from a branch* → `main`
  / `/docs`). That's the current folder-serving setup.
- Change **Source** to **GitHub Actions**.

Folder-serving keeps serving the last `docs/` content until the first Actions
deploy replaces it, so this flip alone doesn't blank the site.

---

## Step 4 — Run the first deploy and verify

Repo → **Actions** tab → **Deploy Client** → **Run workflow** → branch `main`
→ **Run workflow**. This runs the e2e gate and, if green, builds + publishes to
Pages.

Confirm:
- The run is green (every step, including **Assert worker URL baked into
  bundle**).
- The site loads at `https://jonathantheblip.github.io/roadtrip/` and sync
  works (open it, confirm data loads — i.e. the bundle is NOT sync-disabled).

If the e2e gate fails on the first run with **visual-baseline** diffs only
(font anti-aliasing drift on the runner), re-bless on a matching macOS — same
class as `b277f02`. Functional specs are platform-agnostic.

---

## Step 5 — Untrack `docs/` (I run this, after you confirm 1–4)

Once you tell me the workflow exists on `main` **and** Pages is on GitHub
Actions **and** the first deploy served the site, I run the final,
already-prepared step:

```
git rm -r --cached docs/      # stop tracking the artifact (stays on disk)
git commit -m "chore: stop committing built client artifact (docs/) — deployed via Actions"
git push origin main
```

`docs/` is already added to `.gitignore` (staged now; it commits with that
step). After this, `app/**` changes deploy automatically and there is no
committed artifact left to go stale.

---

## Notes / gotchas

- **Runner is `macos-latest` on purpose** — the committed Playwright visual
  baselines are `-darwin`-suffixed (zero `-linux`); a Linux runner would fail
  on missing baselines. Same constraint as the worker pipeline (it runs the
  same e2e suite).
- **The gate is the client's e2e suite only** — the worker's vitest suite is
  not run here (irrelevant to a client deploy). A push touching both `app/**`
  and `worker/**` fires both pipelines independently.
- **CACHE_NAME is auto-stamped** with the commit SHA at build time (in the
  built `docs/sw.js` only), so each deploy gets a fresh cache generation
  without the manual `v65 → v66` bump. The source `app/public/sw.js` is left
  untouched.
- **Build env in CI** comes from `process.env` — `app/vite.config.js`'s
  `loadEnv(mode, cwd/.., '')` merges process env vars, so the workflow's
  `env:` block is enough; no `.env` file is created in CI. The
  **Assert worker URL baked** step is the hard backstop: if the vars are ever
  missing, the deploy fails instead of shipping a sync-disabled site.
