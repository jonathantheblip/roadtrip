// album/moves.jsx — Chapter 3 live surfaces. The moved-note (lightbox story
// line, one-visit chip + section line), the Move-to hand (picker sheet that
// LOCKS the photo), the suggestion banner + its resting place, and the letter.
// Rafa is never rendered here (no notes, no chips, no move controls).

// ── the Move-to picker sheet ─────────────────────────────────────
function MoveSheet({ lens, c, r, onPick, onClose }) {
  const q = CH3_COPY; const lc = lens === 'aurelia';
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: c.surface, borderTopLeftRadius: r + 8, borderTopRightRadius: r + 8, padding: '10px 16px 24px', maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 38, height: 4, borderRadius: 3, background: c.line, margin: '4px auto 12px' }} />
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 18, fontWeight: 600, color: c.ink, marginBottom: 10, fontStyle: lc ? 'italic' : 'normal' }}>{q.sheetTitle[lens]}</div>
        <div className="ft-scroll" style={{ overflowY: 'auto' }}>
          {MOVE_TARGETS.map(sec => (
            <div key={sec.day} style={{ marginBottom: 6 }}>
              <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.4, color: c.faint, textTransform: 'uppercase', padding: '10px 2px 6px' }}>{sec.day}</div>
              {sec.items.map(it => (
                <button key={it.label} onClick={() => !it.current && onPick(it)} style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${c.line}`, background: 'transparent', cursor: it.current ? 'default' : 'pointer', padding: '11px 2px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {it.kind === 'place'
                    ? <Ic.pin s={15} c={it.current ? c.accent : c.muted} />
                    : <span style={{ fontFamily: FONTS.fraunces, fontSize: 16, color: c.muted, lineHeight: 1, width: 15, textAlign: 'center' }}>”</span>}
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontFamily: FONTS.fraunces, fontSize: 15.5, fontWeight: it.kind === 'place' ? 600 : 500, fontStyle: it.kind === 'moment' ? 'italic' : 'normal', color: c.ink }}>{it.label}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.5, color: c.faint, textTransform: 'uppercase' }}>{it.kind === 'moment' ? 'a named moment' : 'a place'}</span>
                  </span>
                  {it.current && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONTS.mono, fontSize: 9, color: c.accent }}><Ic.check s={13} c={c.accent} />{q.hereNow[lens]}</span>}
                </button>
              ))}
            </div>
          ))}
          {/* unfiled always exists */}
          <button onClick={() => onPick({ kind: 'unfiled', label: q.unfiled[lens] })} style={{ width: '100%', textAlign: 'left', border: `1px dashed ${c.lineBold}`, borderRadius: r - 6, background: 'transparent', cursor: 'pointer', padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Ic.grid s={14} c={c.faint} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontFamily: FONTS.fraunces, fontSize: 15, color: c.ink, fontStyle: lc ? 'italic' : 'normal' }}>{q.unfiled[lens]}</span>
              <span style={{ fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.5, color: c.faint, textTransform: 'uppercase' }}>{q.unfiledSub[lens]}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the lightbox: place line, moved-story line, Move-to action ───
function MoveLightbox({ lens, moverName, startPlaced }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius; const q = CH3_COPY;
  const p = MOVED_PHOTO; const lc = lens === 'aurelia';
  const [placed, setPlaced] = React.useState(startPlaced || null);
  const [sheet, setSheet] = React.useState(false);
  const [reason, setReason] = React.useState(p.reason);
  const locked = !!placed;
  const story = locked ? q.locked[lens].replace('{n}', moverName || (lc ? 'you' : 'you')) : q.reasons[reason][lens];
  const placeLabel = placed ? placed.label : p.place;
  return (
    <div style={{ height: '100%', background: t.dark ? '#08080A' : '#171512', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 8px', color: '#fff' }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, opacity: 0.72 }}>3 / 45</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <Ic.share s={18} c="rgba(255,255,255,0.8)" /><Ic.x s={20} c="rgba(255,255,255,0.85)" />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 14px' }}>
        <div style={{ width: '100%', maxWidth: 320 }}><Photo ratio={3 / 4} tint={p.tint} radius={t.dark ? 6 : 10} grain /></div>
      </div>
      <div style={{ padding: '12px 18px 20px', color: '#fff' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.1, opacity: 0.66 }}>{TRAVELERS[p.author].name.toUpperCase()} · {p.date}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, opacity: 0.9 }}><Ic.pin s={13} c="rgba(255,255,255,0.75)" /><span style={{ fontFamily: FONTS.inter, fontSize: 13.5 }}>{placeLabel}</span></div>
        {/* the moved-note: names a human act; firms up when locked */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: locked ? '#F3E4B8' : 'rgba(255,255,255,0.62)' }}>
          {locked && <Ic.lock s={12} c="#F3E4B8" />}
          <span style={{ fontFamily: FONTS.fraunces, fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.35, textWrap: 'pretty' }}>{story}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 15 }}>
          <button style={{ border: '1px solid rgba(255,255,255,0.22)', background: 'transparent', color: 'rgba(255,255,255,0.85)', borderRadius: 999, padding: '7px 13px', fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.6, cursor: 'pointer', textTransform: lc ? 'lowercase' : 'uppercase' }}>{q.editDate[lens]}</button>
          <button onClick={() => setSheet(true)} disabled={locked} style={{ border: 'none', background: locked ? 'rgba(255,255,255,0.14)' : c.accent, color: locked ? 'rgba(255,255,255,0.5)' : c.accentInk, borderRadius: 999, padding: '7px 15px', fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 0.6, cursor: locked ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, textTransform: lc ? 'lowercase' : 'uppercase' }}>
            {locked ? <><Ic.lock s={12} c="rgba(255,255,255,0.5)" /> locked</> : <><Ic.pin s={12} c={c.accentInk} /> {q.action[lens]}</>}
          </button>
        </div>
      </div>
      {sheet && <MoveSheet lens={lens} c={c} r={r} onClose={() => setSheet(false)} onPick={(it) => { setPlaced(it); setSheet(false); }} />}
    </div>
  );
}

// ── album snippet: the one-visit "moved" chip + section line ─────
function MovedSection({ lens }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius; const q = CH3_COPY; const lc = lens === 'aurelia';
  const shots = ALBUM.filter(p => p.kind === 'photo').slice(0, 6);
  return (
    <div style={{ height: '100%', color: c.ink, background: c.bg, padding: '10px 16px', overflow: 'hidden' }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.6, color: c.accent }}>SAT MAY 2 · 9:00 AM</div>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 20, fontWeight: 600, letterSpacing: -0.3, marginTop: 3, fontStyle: lc ? 'italic' : 'normal' }}>Grand Brasserie</div>
      {/* the section-level line — quiets after one visit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, background: c.bg2, borderRadius: r - 6, padding: '8px 11px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.accent }} />
        <span style={{ fontFamily: FONTS.inter, fontSize: 12, color: c.ink, flex: 1 }}>{q.sectionLine[lens]}</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, color: c.faint }}>{q.sectionLineSub[lens]}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 12 }}>
        {shots.map((p, i) => (
          <div key={p.id} style={{ position: 'relative', borderRadius: Math.max(3, r - 8), overflow: 'hidden' }}>
            <Photo ratio={1} tint={p.tint} radius={0} />
            {i < 3 && <span style={{ position: 'absolute', left: 5, bottom: 5, background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.95)', fontFamily: FONTS.mono, fontSize: 7.5, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{q.chip}</span>}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, color: c.faint, marginTop: 12, textAlign: 'center', letterSpacing: 0.4 }}>{lc ? 'gone after this visit — the album stays calm' : 'GONE AFTER THIS VISIT — THE ALBUM STAYS CALM'}</div>
    </div>
  );
}

// ── the suggestion: two-step banner → family-wide rest ───────────
function SuggestDemo({ lens }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius; const q = CH3_COPY; const lc = lens === 'aurelia';
  const [state, setState] = React.useState('banner'); // banner | rest
  return (
    <div style={{ height: '100%', color: c.ink, background: c.bg, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 22, fontWeight: 600, letterSpacing: -0.4, fontStyle: lc ? 'italic' : 'normal' }}>{lc ? 'photos' : 'Photos'}</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.muted, marginTop: 3 }}>45 photos across 6 stops</div>
      {state === 'banner' && (
        <div style={{ marginTop: 14, background: c.surface, border: `1px solid ${c.line}`, borderRadius: r, padding: '13px 15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ic.bolt s={14} c={c.accent} />
            <span style={{ fontFamily: FONTS.inter, fontSize: 13.5, color: c.ink, flex: 1, fontStyle: lc ? 'italic' : 'normal' }}>{q.suggest[lens]}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button style={{ border: 'none', cursor: 'pointer', borderRadius: 999, background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 12.5, fontWeight: 600, padding: '7px 15px' }}>{q.suggestMove[lens]}</button>
            <button onClick={() => setState('rest')} style={{ border: `1px solid ${c.line}`, cursor: 'pointer', borderRadius: 999, background: 'transparent', color: c.muted, fontFamily: FONTS.inter, fontSize: 12.5, padding: '7px 15px' }}>{q.suggestNo[lens]}</button>
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, color: c.faint, marginTop: 10, letterSpacing: 0.3 }}>{lc ? 'not now quiets it on every device' : 'NOT NOW QUIETS IT ON EVERY DEVICE'}</div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      {/* where a dismissed suggestion rests — findable if sought, invisible otherwise */}
      {state === 'rest' && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.4, color: c.faint, textTransform: 'uppercase', marginBottom: 6 }}>Loose ends</div>
          <button style={{ width: '100%', textAlign: 'left', border: `1px solid ${c.line}`, background: c.bg2, cursor: 'pointer', borderRadius: r - 6, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ flex: 1, fontFamily: FONTS.inter, fontSize: 12, color: c.muted, fontStyle: lc ? 'italic' : 'normal' }}>{q.suggestRest[lens]}</span>
            <Ic.right s={15} c={c.faint} />
          </button>
        </div>
      )}
      {state === 'banner' && <div style={{ fontFamily: FONTS.mono, fontSize: 8, color: c.faint, textAlign: 'center', paddingBottom: 4 }}>tap “{q.suggestNo[lens]}” →</div>}
    </div>
  );
}

// ── the backfill letter (one per trip, warm) ─────────────────────
function MoveLetter({ lens }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius; const q = CH3_COPY; const lc = lens === 'aurelia';
  return (
    <div style={{ height: '100%', color: c.ink, background: c.bg, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.4, color: c.faint, textTransform: 'uppercase', marginBottom: 10 }}>Looking back · {q.letterTrip}</div>
      <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: r, padding: '20px 18px', boxShadow: `0 12px 30px ${c.bg2}` }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✉️</div>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 19, fontWeight: 600, letterSpacing: -0.3, color: c.ink, marginTop: 14, lineHeight: 1.35, fontStyle: lc ? 'italic' : 'normal', textWrap: 'pretty' }}>{q.letter[lens]}</div>
        <button style={{ marginTop: 15, border: 'none', cursor: 'pointer', borderRadius: 999, background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 13, fontWeight: 600, padding: '9px 17px', display: 'inline-flex', alignItems: 'center', gap: 7 }}>{q.letterCta[lens]}<Ic.right s={15} c={c.accentInk} /></button>
      </div>
      <div style={{ fontFamily: FONTS.inter, fontSize: 11, fontStyle: 'italic', color: c.faint, textAlign: 'center', marginTop: 12 }}>{lc ? 'one warm note — never a hundred chips' : 'One warm note — never a hundred chips.'}</div>
    </div>
  );
}

Object.assign(window, { MoveLightbox, MoveSheet, MovedSection, SuggestDemo, MoveLetter });
