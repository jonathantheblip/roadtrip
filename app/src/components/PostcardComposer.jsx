import { useEffect, useRef, useState } from 'react'
import { Camera, X, ChevronLeft } from 'lucide-react'
import { TRAVELERS, TRAVELER_DOT, TRAVELER_ORDER } from '../data/travelers'
import { saveMemory } from '../lib/memoryStore'
import { saveAsset, makeAssetKey } from '../lib/memAssets'
import { Avatar } from './Avatar'

// Direction 03 — Postcard Composer. Design-bundle authoritative
// (variant-postcard.jsx#V3_PostcardEditor + prototype.jsx#AureliaCompose).
// Guided 4-step authoring: Photo → Words → Tag → Mood → Send.
//
// A small "where" picker prepends step 1 so the composer can be
// launched from a global FAB without context. Once a stop is chosen
// the 4-step progress bar and preview-postcard appear.
//
// Photos save to the shared IDB asset store (lib/memAssets) — the
// resulting Memory record carries `photoRef.key` (photoRef.storage =
// 'idb'). When CloudKit JS lands we swap the storage adapter only;
// the schema doesn't change.

const MOOD_CHIPS = [
  'quiet',
  'chaos',
  'beautiful',
  'overstimulated',
  'finally',
  'worth it',
  'one more time',
]

export function PostcardComposer({ trip, traveler, onClose, initialStopId }) {
  // pickStop → step 1..4 → done
  const [phase, setPhase] = useState(initialStopId ? 'compose' : 'pickStop')
  const [stopId, setStopId] = useState(initialStopId || null)
  const [step, setStep] = useState(1)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [tagged, setTagged] = useState(() => new Set([traveler]))
  const [mood, setMood] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // Find the stop record once chosen.
  const stop = stopId
    ? trip.days
        .flatMap((d) => d.stops.map((s) => ({ ...s, day: d.n, dayDate: d.date })))
        .find((s) => s.id === stopId)
    : null

  // Default tag set to the stop's `for` list once a stop is picked,
  // unioning the active traveler. Only re-run when the stop ID or
  // viewer changes — the `stop` object itself is recomputed every
  // render and would otherwise loop here.
  useEffect(() => {
    if (!stopId) return
    const picked = trip.days
      .flatMap((d) => d.stops)
      .find((s) => s.id === stopId)
    setTagged(new Set([...(picked?.for || []), traveler]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, traveler])

  // Manage the object URL lifecycle for the photo preview.
  useEffect(() => {
    if (!photoFile) {
      setPhotoUrl(null)
      return
    }
    const u = URL.createObjectURL(photoFile)
    setPhotoUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photoFile])

  function nextStep() {
    if (step < 4) setStep(step + 1)
    else save()
  }
  function prevStep() {
    if (step > 1) setStep(step - 1)
    else if (!initialStopId) setPhase('pickStop')
    else onClose?.()
  }

  function toggleTag(id) {
    const next = new Set(tagged)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setTagged(next)
  }

  async function save() {
    if (!stop) return
    setSaving(true)
    setError('')
    try {
      let photoRef = undefined
      if (photoFile) {
        const key = makeAssetKey('photo')
        await saveAsset('photo', key, photoFile, photoFile.type)
        photoRef = { storage: 'idb', key }
      }
      saveMemory({
        tripId: trip.id,
        stopId: stop.id,
        authorTraveler: traveler,
        visibility: 'shared',
        kind: photoFile ? 'photo' : 'text',
        text: caption || undefined,
        caption: caption || undefined,
        photoRef,
        mood: mood || undefined,
        // Tag the listed travelers as "with" via reactions for now —
        // the schema's `taggedWith` field is Pass 2 (CloudKit). Emoji
        // is a ribbon glyph so it reads as "with you" not a reaction.
        reactions: Array.from(tagged)
          .filter((id) => id !== traveler)
          .map((id) => ({ by: id, emoji: '🎀', at: new Date().toISOString() })),
      })
      onClose?.({ saved: true, stopId: stop.id })
    } catch (err) {
      console.error('postcard save failed', err)
      setError('Save failed — try again.')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Postcard composer"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg)',
        color: 'var(--text)',
        overflow: 'auto',
        paddingBottom: 32,
      }}
    >
      {phase === 'pickStop' && (
        <StopPicker
          trip={trip}
          onCancel={() => onClose?.()}
          onPick={(id) => {
            setStopId(id)
            setStep(1)
            setPhase('compose')
          }}
        />
      )}

      {phase === 'compose' && stop && (
        <>
          {/* Header */}
          <div
            style={{
              padding: '60px 18px 4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={prevStep}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.14em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {step === 1 ? 'CANCEL' : <><ChevronLeft size={11} /> BACK</>}
            </button>
            <Eyebrow color="var(--muted)">POSTCARD · STEP {step} / 4</Eyebrow>
            <button
              type="button"
              onClick={nextStep}
              disabled={saving || (step === 1 && false) /* photo optional */}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--accent)',
                cursor: saving ? 'default' : 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.14em',
                fontWeight: 600,
                opacity: saving ? 0.5 : 1,
              }}
            >
              {step < 4 ? 'NEXT' : saving ? 'SAVING…' : 'SEND'}
            </button>
          </div>

          {/* Progress */}
          <div style={{ padding: '6px 18px 8px', display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: n <= step ? 'var(--accent)' : 'var(--border)',
                }}
              />
            ))}
          </div>

          {/* Step prompt */}
          <div style={{ padding: '14px 18px 0' }}>
            <div
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.05,
                fontStyle: 'italic',
              }}
            >
              {STEP_TITLES[step - 1]}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {STEP_HINTS[step - 1]}
            </div>
          </div>

          {/* Postcard preview — always visible */}
          <div style={{ padding: '20px 18px 14px' }}>
            <PostcardPreview
              stop={stop}
              photoUrl={photoUrl}
              caption={caption}
              traveler={traveler}
              mood={mood}
            />
          </div>

          {/* Step content */}
          <div style={{ padding: '6px 18px 0' }}>
            {step === 1 && (
              <PhotoStep
                photoUrl={photoUrl}
                onPick={() => fileInputRef.current?.click()}
                onClear={() => setPhotoFile(null)}
              />
            )}
            {step === 2 && (
              <CaptionStep caption={caption} onChange={setCaption} />
            )}
            {step === 3 && (
              <TagStep tagged={tagged} onToggle={toggleTag} />
            )}
            {step === 4 && (
              <MoodStep mood={mood} onPick={setMood} />
            )}
          </div>

          {error && (
            <p
              style={{
                margin: '14px 18px 0',
                fontSize: 12,
                color: 'var(--accent)',
              }}
            >
              {error}
            </p>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPhotoFile(f)
              e.target.value = ''
            }}
          />
        </>
      )}
    </div>
  )
}

const STEP_TITLES = [
  'What was the picture?',
  'What happened?',
  'Who was there?',
  'How did it feel?',
]
const STEP_HINTS = [
  'pick a photo from your roll, or skip — words alone are fine.',
  'one or two sentences in your own voice. no pressure.',
  'tap to credit. they get a notification.',
  'choose one. you can change it later.',
]

function PostcardPreview({ stop, photoUrl, caption, traveler, mood }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 4,
        padding: 10,
        boxShadow: '0 8px 24px rgba(61,14,34,0.18)',
        transform: 'rotate(-1.5deg)',
        position: 'relative',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: 30,
          width: 50,
          height: 16,
          background: 'rgba(255,255,255,0.6)',
          transform: 'rotate(-8deg)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      />
      <div
        style={{
          width: '100%',
          aspectRatio: '5 / 3',
          borderRadius: 2,
          overflow: 'hidden',
          background: photoUrl
            ? `url(${photoUrl}) center/cover no-repeat`
            : 'repeating-linear-gradient(45deg, #e8a880, #e8a880 6px, #d99670 6px, #d99670 12px)',
          position: 'relative',
        }}
      >
        {!photoUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(0,0,0,0.55)',
              background: 'rgba(255,255,255,0.85)',
              padding: '4px 8px',
              borderRadius: 3,
              width: 'fit-content',
              height: 'fit-content',
              margin: 'auto',
            }}
          >
            {(stop.name || '').toLowerCase()} · {stop.time?.toLowerCase()}
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '0 4px',
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 14,
          fontStyle: 'italic',
          lineHeight: 1.35,
          minHeight: 19,
          color: caption ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {caption ? `“${caption}”` : '“…”'}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 4px 0',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          color: 'var(--muted)',
          letterSpacing: '0.08em',
        }}
      >
        <span>
          {(stop.dayDate || '').toUpperCase()} · {stop.time}
        </span>
        <span>{(stop.address || '').split(',')[0] || ''}</span>
      </div>
      {mood && (
        <div
          style={{
            padding: '6px 4px 0',
            fontFamily: 'Fraunces, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 11,
            color: 'var(--accent)',
            textAlign: 'right',
          }}
        >
          felt {mood}
        </div>
      )}
    </div>
  )
}

function PhotoStep({ photoUrl, onPick, onClear }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        type="button"
        onClick={onPick}
        style={{
          flex: 1,
          padding: 14,
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Camera size={18} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {photoUrl ? 'Change photo' : 'Pick a photo'}
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: 'var(--muted)',
              letterSpacing: '0.1em',
              marginTop: 2,
            }}
          >
            {photoUrl ? 'TAP TO REPLACE' : 'CAMERA OR LIBRARY'}
          </div>
        </div>
      </button>
      {photoUrl && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove photo"
          style={{
            width: 44,
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

function CaptionStep({ caption, onChange }) {
  return (
    <textarea
      value={caption}
      onChange={(e) => onChange(e.target.value)}
      placeholder="what happened here? what it felt like…"
      autoFocus
      rows={4}
      style={{
        width: '100%',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 14,
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 16,
        fontStyle: 'italic',
        lineHeight: 1.4,
        color: 'var(--text)',
        outline: 'none',
        resize: 'vertical',
        minHeight: 88,
      }}
    />
  )
}

function TagStep({ tagged, onToggle }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {TRAVELER_ORDER.map((id) => {
        const tr = TRAVELERS[id]
        const isOn = tagged.has(id)
        const dot = TRAVELER_DOT[id]
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={isOn}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: isOn ? dot : 'transparent',
              color: isOn ? '#fff' : 'var(--text)',
              border: isOn ? 'none' : '1.5px dashed var(--border)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <Avatar id={id} size={28} />
            <span
              style={{
                fontFamily: 'Inter Tight, system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {tr.name.toLowerCase()}
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 8,
                opacity: 0.7,
                letterSpacing: '0.08em',
              }}
            >
              {isOn ? '✓ TAGGED' : 'TAP'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MoodStep({ mood, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {MOOD_CHIPS.map((m) => {
        const isOn = mood === m
        return (
          <button
            key={m}
            type="button"
            onClick={() => onPick(isOn ? '' : m)}
            aria-pressed={isOn}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: isOn ? 'var(--accent)' : 'var(--bg2)',
              color: isOn ? '#fff' : 'var(--muted)',
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 13,
              fontStyle: 'italic',
              border: isOn ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {m}
          </button>
        )
      })}
    </div>
  )
}

function StopPicker({ trip, onCancel, onPick }) {
  return (
    <div style={{ paddingBottom: 32 }}>
      <div
        style={{
          padding: '60px 18px 4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.14em',
          }}
        >
          CANCEL
        </button>
        <Eyebrow color="var(--muted)">POSTCARD · WHERE?</Eyebrow>
        <span style={{ width: 60 }} />
      </div>
      <div style={{ padding: '18px 18px 0' }}>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.05,
            fontStyle: 'italic',
          }}
        >
          Where did this happen?
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          tap the stop you want this postcard to live with.
        </div>
      </div>
      <div style={{ padding: '20px 18px 0' }}>
        {trip.days.map((d) => (
          <div key={d.n} style={{ marginBottom: 18 }}>
            <Eyebrow color="var(--muted)" style={{ marginBottom: 8 }}>
              DAY {d.n} · {(d.date || '').toUpperCase()}
            </Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.stops.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick(s.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      color: 'var(--muted)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {s.time} · {(s.kind || '').toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Fraunces, Georgia, serif',
                      fontSize: 15,
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {s.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Eyebrow({ children, color, style }) {
  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: color || 'currentColor',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
