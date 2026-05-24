import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Link2, Sparkles, AlertCircle, ArrowRight } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT } from '../data/travelers'
import {
  getActivitiesForTrip,
  findExisting,
  CATEGORY_LABEL,
} from '../data/sideActivities'
import { parseShareUrl, isResolvableShortHost } from '../lib/shareIn/parseShareUrl'
import { isWorkerConfigured, workerFetch } from '../lib/workerSync'

// Share-In v2 — the destination view for every share intake path.
//
// Funnel: Web Share Target POSTs / Apple Shortcut launches the SPA
// with `?url=<encoded>&action=import`. App.jsx reads it at mount,
// dispatches into the 'import' view-state, and hands the raw URL to
// this component. The paste interstitial in ActivitiesView routes
// through the same prop, so all three ingestion paths converge here.
//
// Phases:
//   parsing    — local URL parse + optional Worker /resolve for short
//                links. Quick, no UI past a spinner.
//   enriching  — Worker /draft for default tags + descriptions. Runs
//                only when the parse produced a usable name. Failure
//                here is non-fatal — the user can still save manually.
//   confirming — editable card. User picks category, can tweak name /
//                address / coords / tags / descriptions. Save is
//                disabled until name + address + ≥1 tag + descriptions
//                for every active tag are present.
//   exists     — canonicalKey collided with an existing activity. We
//                render the existing card with a "Already in this
//                trip" banner instead of letting the user add a dupe.
//   saved      — appended to trip.sharedActivities. Quick confirmation,
//                button back to Things to do.
//
// No silent saves. Every appended record carries
// { source: 'share_in', importMeta: { rawUrl, resolvedUrl, importedAt,
// authorTraveler } } so the album / activity list can render the
// "added via share" indicator and trace provenance.

const CATEGORIES = [
  'beach',
  'museum',
  'shopping',
  'entertainment',
  'meal_breakfast',
  'meal_lunch',
  'meal_dinner',
]

const FAMILY = ['jonathan', 'helen', 'aurelia', 'rafa']

export function ImportView({ trip, traveler, initialUrl, onBack, onSave }) {
  const [rawUrl, setRawUrl] = useState(initialUrl || '')
  const [phase, setPhase] = useState('parsing') // 'parsing' | 'confirming' | 'exists' | 'saved' | 'error'
  const [draft, setDraft] = useState(null)
  const [existing, setExisting] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [enriching, setEnriching] = useState(false)

  // Re-run the resolve + draft pipeline whenever the rawUrl changes
  // (which happens once on mount, or when the user pastes a new URL
  // into the manual recovery field below).
  useEffect(() => {
    let cancelled = false
    if (!rawUrl) {
      setPhase('confirming')
      setDraft(blankDraft({ rawUrl: '' }))
      return
    }
    setPhase('parsing')
    setErrorMsg(null)
    ;(async () => {
      try {
        const resolved = await runResolve(rawUrl)
        if (cancelled) return
        const parsed = parseShareUrl(resolved.url)
        if (cancelled) return
        const next = blankDraft({
          rawUrl,
          resolvedUrl: resolved.url,
          parsed,
        })
        // Pre-fill from parser.
        next.name = parsed.name || ''
        next.address = parsed.address || ''
        next.lat = parsed.lat ?? null
        next.lng = parsed.lng ?? null
        // De-dup check against the full activities list (seed +
        // already-imported). Short-circuits the rest of the flow when
        // we already have this place.
        const list = getActivitiesForTrip(trip?.id, trip)
        const dupe = findExisting(list, {
          name: next.name,
          lat: next.lat,
          lng: next.lng,
        })
        if (dupe) {
          if (cancelled) return
          setExisting(dupe)
          setPhase('exists')
          return
        }
        setDraft(next)
        setPhase('confirming')
        // Enrich asynchronously — never blocks the user reaching the
        // confirmation card.
        if (next.name && next.category) {
          enrichDraft(next, (patch) => {
            if (cancelled) return
            setDraft((d) => (d ? { ...d, ...patch } : d))
          })
        }
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err?.message || 'Could not read that link.')
        setDraft(blankDraft({ rawUrl }))
        setPhase('confirming')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rawUrl, trip])

  function updateField(name, value) {
    setDraft((d) => (d ? { ...d, [name]: value } : d))
  }

  function toggleTag(member) {
    setDraft((d) => {
      if (!d) return d
      const tags = d.tags.includes(member)
        ? d.tags.filter((t) => t !== member)
        : [...d.tags, member]
      const descriptions = { ...d.descriptions }
      // Drop descriptions for tags that disappeared; seed an empty
      // string for new ones so the field renders immediately.
      for (const k of Object.keys(descriptions)) {
        if (!tags.includes(k)) delete descriptions[k]
      }
      for (const t of tags) {
        if (descriptions[t] === undefined) descriptions[t] = ''
      }
      return { ...d, tags, descriptions }
    })
  }

  async function runEnrichManually() {
    if (!draft?.name || !draft?.category) return
    setEnriching(true)
    try {
      await enrichDraft(draft, (patch) =>
        setDraft((d) => (d ? { ...d, ...patch } : d))
      )
    } finally {
      setEnriching(false)
    }
  }

  function readyToSave() {
    if (!draft) return false
    if (!draft.name?.trim()) return false
    if (!draft.address?.trim()) return false
    if (!draft.category) return false
    if (!draft.tags?.length) return false
    for (const t of draft.tags) {
      const desc = draft.descriptions?.[t]
      if (typeof desc !== 'string' || !desc.trim()) return false
    }
    return true
  }

  async function handleSave() {
    if (!readyToSave() || !draft || !trip) return
    const id = makeImportedId(trip.id, draft.name)
    const record = {
      id,
      tripId: trip.id,
      name: draft.name.trim(),
      address: draft.address.trim(),
      lat: Number.isFinite(draft.lat) ? Number(draft.lat) : null,
      lng: Number.isFinite(draft.lng) ? Number(draft.lng) : null,
      category: draft.category,
      tags: [...draft.tags],
      descriptions: Object.fromEntries(
        draft.tags.map((t) => [t, (draft.descriptions[t] || '').trim()])
      ),
      source: 'share_in',
      importMeta: {
        rawUrl: draft.rawUrl,
        resolvedUrl: draft.resolvedUrl || null,
        importedAt: new Date().toISOString(),
        importedBy: traveler,
      },
    }
    await onSave?.(record)
    setPhase('saved')
  }

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        paddingBottom: 120,
      }}
    >
      <header style={{ padding: '60px 18px 6px' }}>
        <button
          onClick={onBack}
          type="button"
          style={backLinkStyle()}
        >
          <ChevronLeft size={12} /> {trip?.title || 'Trip'}
        </button>
        <div
          style={{
            fontFamily: 'Fraunces, "Iowan Old Style", Georgia, serif',
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Add from a shared link
        </div>
        <p
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          Drops it straight into "Things to do" for this trip. Nothing
          saves until you tap Save.
        </p>
      </header>

      {phase === 'parsing' && (
        <Status text="Reading that link…" />
      )}

      {phase === 'exists' && existing && (
        <AlreadyExists existing={existing} onBack={onBack} />
      )}

      {phase === 'saved' && draft && (
        <SavedConfirmation name={draft.name} onBack={onBack} />
      )}

      {phase === 'confirming' && draft && (
        <div style={{ padding: '12px 14px 0' }}>
          {errorMsg && <Banner tone="warn" text={errorMsg} />}
          <UrlField rawUrl={rawUrl} onChange={setRawUrl} />
          <Field
            label="Name"
            testId="import-name"
            value={draft.name}
            onChange={(v) => updateField('name', v)}
            required
            placeholder="Sift Bake Shop"
          />
          <Field
            label="Address"
            testId="import-address"
            value={draft.address}
            onChange={(v) => updateField('address', v)}
            required
            placeholder="5 Water St, Mystic, CT"
          />
          <CoordsField
            lat={draft.lat}
            lng={draft.lng}
            onLat={(v) => updateField('lat', v)}
            onLng={(v) => updateField('lng', v)}
          />
          <CategoryField
            value={draft.category}
            onChange={(v) => updateField('category', v)}
          />
          <TagsField
            selected={draft.tags}
            onToggle={toggleTag}
          />
          <DescriptionsField
            tags={draft.tags}
            descriptions={draft.descriptions}
            onChange={(member, v) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      descriptions: { ...d.descriptions, [member]: v },
                    }
                  : d
              )
            }
            onEnrich={runEnrichManually}
            enriching={enriching}
            canEnrich={!!(draft.name && draft.category)}
          />

          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              marginTop: 18,
            }}
          >
            <button
              type="button"
              onClick={onBack}
              className="btn-pill"
              style={{ cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="import-save"
              className="btn-pill"
              disabled={!readyToSave()}
              onClick={handleSave}
              style={{
                cursor: readyToSave() ? 'pointer' : 'not-allowed',
                background: 'var(--accent)',
                color: '#fff',
                border: '1px solid var(--accent)',
              }}
            >
              Save to trip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function blankDraft({ rawUrl = '', resolvedUrl = null, parsed = null }) {
  return {
    rawUrl,
    resolvedUrl,
    parsed,
    name: '',
    address: '',
    lat: null,
    lng: null,
    category: '',
    tags: [],
    descriptions: {},
  }
}

// Resolve a short URL via the Worker, or pass through long-form URLs
// unchanged. Catches everything: a failed resolve returns the raw URL
// so the user still gets the manual confirmation card.
async function runResolve(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { url: rawUrl }
  }
  if (!isResolvableShortHost(parsed.hostname) || !isWorkerConfigured()) {
    return { url: rawUrl }
  }
  try {
    const res = await workerFetch(`/resolve?url=${encodeURIComponent(rawUrl)}`)
    if (!res.ok) return { url: rawUrl }
    const data = await res.json()
    return { url: typeof data?.resolved === 'string' ? data.resolved : rawUrl }
  } catch {
    return { url: rawUrl }
  }
}

// Hit the Worker /draft endpoint and merge any returned tags +
// descriptions into the in-progress draft. Caller passes the latest
// draft snapshot and a setter for the resulting patch. Failure is
// invisible to the user — the form stays editable.
async function enrichDraft(snapshot, applyPatch) {
  if (!isWorkerConfigured()) return
  try {
    const res = await workerFetch('/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: snapshot.name,
        address: snapshot.address,
        category: snapshot.category,
      }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data?.tags) || data.tags.length === 0) return
    // Only fill the user's blanks — never overwrite manual edits.
    applyPatch({
      tags: snapshot.tags.length ? snapshot.tags : data.tags,
      descriptions: mergeDescriptions(snapshot.descriptions, data.descriptions),
    })
  } catch {
    /* silent */
  }
}

function mergeDescriptions(existing, incoming) {
  const next = { ...existing }
  if (incoming && typeof incoming === 'object') {
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v !== 'string' || !v.trim()) continue
      // Don't overwrite an existing draft entry the user typed in.
      if (typeof next[k] === 'string' && next[k].trim()) continue
      next[k] = v.trim()
    }
  }
  return next
}

function makeImportedId(tripId, name) {
  const slug = (name || 'shared')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'shared'
  const rand = Math.random().toString(36).slice(2, 6)
  return `share_${slug}_${rand}`
}

function UrlField({ rawUrl, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle()}>
        <Link2 size={10} style={{ marginRight: 4 }} />
        Link
      </label>
      <input
        type="url"
        data-testid="import-url-field"
        value={rawUrl}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://maps.app.goo.gl/…"
        style={inputStyle()}
      />
    </div>
  )
}

function Field({ label, value, onChange, testId, required, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle()}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>
            *
          </span>
        )}
      </label>
      <input
        type="text"
        data-testid={testId}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ''}
        style={inputStyle()}
      />
    </div>
  )
}

function CoordsField({ lat, lng, onLat, onLng }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <label style={labelStyle()}>Latitude</label>
        <input
          type="number"
          step="any"
          data-testid="import-lat"
          value={lat ?? ''}
          onChange={(e) => onLat(e.target.value === '' ? null : Number(e.target.value))}
          style={inputStyle()}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label style={labelStyle()}>Longitude</label>
        <input
          type="number"
          step="any"
          data-testid="import-lng"
          value={lng ?? ''}
          onChange={(e) => onLng(e.target.value === '' ? null : Number(e.target.value))}
          style={inputStyle()}
        />
      </div>
    </div>
  )
}

function CategoryField({ value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle()}>
        Category
        <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
      </label>
      <select
        data-testid="import-category"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle()}
      >
        <option value="" style={{ color: '#1A1614' }}>
          Pick a category
        </option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c} style={{ color: '#1A1614' }}>
            {CATEGORY_LABEL[c] || c}
          </option>
        ))}
      </select>
    </div>
  )
}

function TagsField({ selected, onToggle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle()}>
        Who would enjoy this
        <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
      </label>
      <div data-testid="import-tags" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FAMILY.map((id) => {
          const on = selected.includes(id)
          return (
            <button
              key={id}
              type="button"
              data-testid={`import-tag-${id}`}
              onClick={() => onToggle(id)}
              aria-pressed={on}
              style={{
                padding: '6px 12px',
                borderRadius: 14,
                border: '1px solid',
                borderColor: on ? TRAVELER_DOT[id] || 'var(--accent)' : 'var(--border)',
                background: on ? TRAVELER_DOT[id] || 'var(--accent)' : 'transparent',
                color: on ? '#FBF8F2' : 'inherit',
                cursor: 'pointer',
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              {TRAVELERS[id]?.name || id}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DescriptionsField({
  tags,
  descriptions,
  onChange,
  onEnrich,
  enriching,
  canEnrich,
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={labelStyle()}>
          Descriptions
          {tags.length > 0 && (
            <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
          )}
        </label>
        {canEnrich && (
          <button
            type="button"
            data-testid="import-enrich"
            onClick={onEnrich}
            disabled={enriching}
            style={{
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              cursor: enriching ? 'wait' : 'pointer',
              padding: '4px 10px',
              borderRadius: 12,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Sparkles size={10} /> {enriching ? 'Drafting…' : 'Draft with Claude'}
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <p
          style={{
            fontStyle: 'italic',
            color: 'var(--muted)',
            margin: '6px 0 0',
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 13,
          }}
        >
          Pick at least one person above to start.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {tags.map((t) => (
            <div key={t}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: TRAVELER_DOT[t] || 'var(--accent)',
                    display: 'inline-block',
                  }}
                />
                {TRAVELERS[t]?.name || t}
              </div>
              <textarea
                data-testid={`import-desc-${t}`}
                rows={2}
                value={descriptions[t] || ''}
                onChange={(e) => onChange(t, e.target.value)}
                style={{ ...inputStyle(), resize: 'vertical', minHeight: 56 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Status({ text }) {
  return (
    <div
      data-testid="import-status"
      style={{
        padding: '24px 18px',
        textAlign: 'center',
        color: 'var(--muted)',
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 15,
      }}
    >
      {text}
    </div>
  )
}

function AlreadyExists({ existing, onBack }) {
  return (
    <div
      data-testid="import-exists"
      style={{
        padding: '20px 14px 0',
      }}
    >
      <Banner
        tone="info"
        text="Already in this trip — nothing to add."
      />
      <div
        style={{
          padding: '14px 16px',
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--card, transparent)',
          marginTop: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {CATEGORY_LABEL[existing.category] || existing.category}
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            marginTop: 4,
          }}
        >
          {existing.name}
        </div>
        {existing.address && (
          <div
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            {existing.address}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-pill"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent)',
            cursor: 'pointer',
          }}
        >
          Back to Things to do <ArrowRight size={12} />
        </button>
      </div>
    </div>
  )
}

function SavedConfirmation({ name, onBack }) {
  return (
    <div
      data-testid="import-saved"
      style={{ padding: '20px 14px 0' }}
    >
      <Banner tone="ok" text={`Saved “${name}” to Things to do.`} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-pill"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: '1px solid var(--accent)',
            cursor: 'pointer',
          }}
        >
          See the trip
        </button>
      </div>
    </div>
  )
}

function Banner({ tone, text }) {
  const color =
    tone === 'ok'
      ? 'var(--accent)'
      : tone === 'warn'
        ? '#B05E13'
        : 'var(--muted)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: `1px solid ${color}`,
        background: 'transparent',
        borderRadius: 8,
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic',
        fontSize: 14,
      }}
    >
      {tone === 'warn' ? <AlertCircle size={14} /> : <Sparkles size={14} />}
      {text}
    </div>
  )
}

function labelStyle() {
  return {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    opacity: 0.65,
    marginBottom: 4,
    display: 'inline-flex',
    alignItems: 'center',
  }
}

function inputStyle() {
  return {
    width: '100%',
    padding: '9px 10px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text)',
    fontFamily: 'Inter Tight, system-ui, sans-serif',
    fontSize: 14,
  }
}

function backLinkStyle() {
  return {
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    color: 'var(--muted)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 18,
  }
}
