// album/finish.jsx — Chapter 2 live surfaces. The door (keepsake home) → a
// past-day settle page (photos big, evidence pins as caption slots awaiting a
// word) → the gold keep. Plus pooled quiet days, the no-evidence day, the
// backfill letter, Aurelia's "pick the day's picture", and the archive pass.
// Rafa is never rendered here (excluded by rule).

const GOLD = '#C6982E';
const GOLD_SOFT = 'rgba(198,152,46,0.14)';

// ── the door: a finished trip's keepsake home ────────────────────
function FinHome({ lens, c, r, onOpenDay, onArchive }) {
  const q = CH2_COPY;
  const dot = (d) => d.kept ? GOLD : d.loose ? c.accent : c.faint;
  return (
    <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 28px' }}>
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.4, color: c.faint, textTransform: 'uppercase' }}>{CABIN.when} · kept trip</div>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 30, fontWeight: 600, letterSpacing: -0.5, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal', marginTop: 2 }}>{lens === 'aurelia' ? 'cape cod' : 'Cape Cod'}</div>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 14, fontStyle: 'italic', color: c.muted }}>{CABIN.sub}</div>
      </div>
      {/* the quiet door — invites, never nags */}
      <div style={{ marginTop: 16, background: c.surface, border: `1px solid ${c.line}`, borderRadius: r, padding: '15px 16px' }}>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 16.5, color: c.ink, lineHeight: 1.4, fontStyle: lens === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{q.door[lens]}</div>
        <div style={{ fontFamily: FONTS.inter, fontSize: 12, color: c.faint, marginTop: 6 }}>{q.doorSub[lens]}</div>
        <button onClick={() => onOpenDay(CABIN.days.find(d => d.loose).n)} style={{ marginTop: 12, border: 'none', cursor: 'pointer', borderRadius: 999, background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 13, fontWeight: 600, padding: '9px 16px' }}>{q.finish[lens]}</button>
      </div>
      {/* the softened after-trip day grid */}
      <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.4, color: c.faint, textTransform: 'uppercase', margin: '22px 0 10px' }}>The days</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
        {CABIN.days.map(d => (
          <button key={d.n} onClick={() => onOpenDay(d.n)} style={{ border: `1px solid ${c.line}`, background: d.kept ? GOLD_SOFT : c.bg2, cursor: 'pointer', borderRadius: r - 6, padding: '11px 11px 12px', textAlign: 'left', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: '50%', background: d.kept ? GOLD : 'transparent', border: d.kept ? 'none' : `1.5px ${d.loose ? 'solid' : 'dashed'} ${dot(d)}` }} />
            <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.6, color: c.faint }}>{d.date.toUpperCase()}</div>
            <div style={{ fontFamily: FONTS.fraunces, fontSize: 13.5, fontWeight: 600, color: c.ink, marginTop: 5, lineHeight: 1.15 }}>{d.name || (d.quiet ? (lens === 'aurelia' ? 'quiet one' : 'A quiet one') : d.noEvidence ? '—' : (lens === 'aurelia' ? 'not named' : 'Not named yet'))}</div>
            {d.kept && <div style={{ fontFamily: FONTS.mono, fontSize: 7.5, letterSpacing: 0.6, color: GOLD, marginTop: 6, textTransform: 'uppercase' }}>✓ kept</div>}
          </button>
        ))}
      </div>
      {/* archive letter entry */}
      <button onClick={onArchive} style={{ width: '100%', marginTop: 18, border: `1px solid ${c.line}`, background: 'transparent', cursor: 'pointer', borderRadius: r, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>✉️</span>
        <span style={{ flex: 1, fontFamily: FONTS.inter, fontSize: 12.5, color: c.muted, lineHeight: 1.45 }}>{CH2_COPY.backfill[lens]}</span>
        <Ic.right s={16} c={c.faint} />
      </button>
    </div>
  );
}

// ── one evidence pin as a caption slot awaiting a word ───────────
function FinPin({ pin, lens, c, r, name, onName, out, onOut }) {
  const [editing, setEditing] = React.useState(false);
  const machine = `${pin.place} · ${pin.range} · ${pin.count} photos`;
  return (
    <div style={{ marginTop: 18, opacity: out ? 0.4 : 1 }}>
      <div style={{ position: 'relative', borderRadius: r - 4, overflow: 'hidden' }}>
        <Photo ratio={3 / 2} tint={pin.tint} radius={0} grain />
        <div style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: FONTS.mono, fontSize: 9, padding: '2px 7px', borderRadius: 4 }}>{pin.count} photos</div>
        {out && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}><span style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, color: '#fff' }}>LEFT OUT</span></div>}
      </div>
      {/* caption slot: machine guess dashed/mono until named */}
      <div style={{ marginTop: 9 }}>
        {name ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: FONTS.fraunces, fontSize: 19, fontWeight: 600, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal' }}>{name}</span>
            <button onClick={() => setEditing(true)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: c.faint, fontFamily: FONTS.mono, fontSize: 9 }}>edit</button>
          </div>
        ) : editing ? (
          <input autoFocus defaultValue="" placeholder={lens === 'aurelia' ? 'name this moment…' : 'Name this moment…'} onBlur={e => { if (e.target.value.trim()) onName(e.target.value.trim()); setEditing(false); }} onKeyDown={e => { if (e.key === 'Enter') { if (e.target.value.trim()) onName(e.target.value.trim()); setEditing(false); } }} style={{ width: '100%', border: 'none', borderBottom: `2px solid ${c.accent}`, outline: 'none', background: 'transparent', color: c.ink, fontFamily: FONTS.fraunces, fontSize: 19, fontStyle: 'italic', padding: '2px 0' }} />
        ) : (
          <button onClick={() => setEditing(true)} style={{ border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 0.4, color: c.muted, borderBottom: `1.5px dashed ${c.lineBold}`, paddingBottom: 4, display: 'inline-block' }}>{machine}</div>
          </button>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 7 }}>
          {!name && !editing && <span style={{ fontFamily: FONTS.inter, fontSize: 11.5, fontStyle: 'italic', color: c.faint }}>{CH2_COPY.pinHint[lens]}</span>}
          <button onClick={() => onOut(!out)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: c.faint, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.4 }}>{out ? 'put it back' : CH2_COPY.leaveOut[lens]}</button>
        </div>
      </div>
    </div>
  );
}

// ── the past-day settle page ─────────────────────────────────────
function FinDaySettle({ lens, c, r, day, onBack, onKeep }) {
  const q = CH2_COPY;
  const [names, setNames] = React.useState({});
  const [outs, setOuts] = React.useState({});
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px 10px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Ic.left s={22} c={c.ink} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2, color: c.faint }}>{day.date.toUpperCase()}</div>
        </div>
      </div>
      <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 18px 20px' }}>
        {day.loose && <>
          <div style={{ fontFamily: FONTS.fraunces, fontSize: 25, fontWeight: 600, letterSpacing: -0.4, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal' }}>{lens === 'aurelia' ? 'what happened this day' : 'What happened this day'}</div>
          <div style={{ fontFamily: FONTS.inter, fontSize: 12, color: c.faint, marginTop: 5 }}>{q.doorSub[lens]}</div>
          {day.rafaNote && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 11, background: TRAVELERS.rafa.dot + '18', border: `1px solid ${TRAVELERS.rafa.dot}44`, borderRadius: r - 4, padding: '10px 13px' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: TRAVELERS.rafa.dot, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.play s={13} c="#fff" /></div>
              <span style={{ flex: 1, fontFamily: FONTS.inter, fontSize: 12.5, color: c.ink }}>{q.rafaNote[lens]}</span>
              <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint }}>0:18</span>
            </div>
          )}
          {day.pins.map(p => <FinPin key={p.id} pin={p} lens={lens} c={c} r={r} name={names[p.id]} onName={v => setNames(s => ({ ...s, [p.id]: v }))} out={outs[p.id]} onOut={v => setOuts(s => ({ ...s, [p.id]: v }))} />)}
        </>}
        {day.quiet && <FinQuiet lens={lens} c={c} r={r} day={day} />}
        {day.noEvidence && <FinNoEvidence lens={lens} c={c} r={r} />}
      </div>
      <div style={{ flexShrink: 0, padding: '10px 18px 18px', borderTop: `1px solid ${c.line}`, background: c.surface }}>
        <button onClick={() => onKeep(day, day.quiet)} style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 999, background: GOLD, color: '#241a06', fontFamily: FONTS.inter, fontSize: 15, fontWeight: 700, padding: '13px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ic.check s={17} c="#241a06" />{day.quiet ? (CABIN_QUIET > 1 ? q.pooled[lens].split('—')[0].trim() && (lens === 'aurelia' ? 'keep the quiet stretch' : 'Keep the quiet days') : q.keep[lens]) : q.keep[lens]}
        </button>
      </div>
    </div>
  );
}

function FinQuiet({ lens, c, r, day }) {
  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ borderRadius: r, overflow: 'hidden', marginBottom: 16 }}><Photo ratio={16 / 10} tint={day.tint} radius={0} grain /></div>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 23, fontWeight: 600, letterSpacing: -0.4, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{CH2_COPY.quiet[lens]}</div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.faint, marginTop: 8 }}>{day.count} photos · no places to name</div>
      {CABIN_QUIET > 1 && (
        <div style={{ marginTop: 16, background: c.bg2, borderRadius: r - 4, padding: '13px 15px', borderLeft: `3px solid ${GOLD}` }}>
          <div style={{ fontFamily: FONTS.inter, fontSize: 13, color: c.ink, lineHeight: 1.45, textWrap: 'pretty' }}>{CH2_COPY.pooled[lens]}</div>
        </div>
      )}
    </div>
  );
}

function FinNoEvidence({ lens, c, r }) {
  return (
    <div style={{ paddingTop: 20, textAlign: 'center' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: c.bg2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Ic.clock s={24} c={c.faint} /></div>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 17, fontStyle: 'italic', color: c.ink, lineHeight: 1.5, maxWidth: 270, margin: '0 auto', textWrap: 'pretty' }}>{CH2_COPY.noEvidence[lens]}</div>
      <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 18 }}>
        <button style={{ border: `1px solid ${c.line}`, background: 'transparent', cursor: 'pointer', borderRadius: 999, color: c.muted, fontFamily: FONTS.inter, fontSize: 12.5, padding: '8px 15px' }}>{CH2_COPY.rest[lens]}</button>
        <button style={{ border: 'none', background: c.accent, color: c.accentInk, cursor: 'pointer', borderRadius: 999, fontFamily: FONTS.inter, fontSize: 12.5, fontWeight: 600, padding: '8px 15px', display: 'flex', alignItems: 'center', gap: 6 }}><Ic.mic s={13} c={c.accentInk} />{CH2_COPY.tell[lens]}</button>
      </div>
    </div>
  );
}

// ── the gold keep confirmation ───────────────────────────────────
function FinKept({ lens, c, r, pooled, onBook, onDone }) {
  const q = CH2_COPY;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 26, textAlign: 'center' }}>
      <div style={{ width: 74, height: 74, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${GOLD_SOFT}` }}><Ic.check s={34} c="#241a06" /></div>
      <div style={{ fontFamily: FONTS.fraunces, fontSize: 23, fontWeight: 600, letterSpacing: -0.3, color: c.ink, marginTop: 22, lineHeight: 1.3, fontStyle: lens === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{q.kept[lens]}</div>
      <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: c.muted, marginTop: 10, maxWidth: 260, lineHeight: 1.5 }}>{q.keptSub[lens]}</div>
      <div style={{ marginTop: 26, width: '100%', maxWidth: 300, background: c.bg2, borderRadius: r, padding: '15px 16px' }}>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 15.5, color: c.ink, fontStyle: lens === 'aurelia' ? 'italic' : 'normal' }}>{q.book[lens]}</div>
        <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
          <button onClick={onBook} style={{ flex: 1, border: 'none', cursor: 'pointer', borderRadius: 999, background: c.accent, color: c.accentInk, fontFamily: FONTS.inter, fontSize: 13, fontWeight: 600, padding: '9px 0' }}>{lens === 'aurelia' ? 'in the book' : 'In the book'}</button>
          <button onClick={onDone} style={{ flex: 1, border: `1px solid ${c.line}`, cursor: 'pointer', borderRadius: 999, background: 'transparent', color: c.muted, fontFamily: FONTS.inter, fontSize: 13, padding: '9px 0' }}>{lens === 'aurelia' ? 'not now' : 'Not now'}</button>
        </div>
      </div>
    </div>
  );
}

// ── the interactive centerpiece: door → settle → kept ────────────
function FinishApp({ lens = 'helen', start = 'home' }) {
  const t = TRAVELERS[lens]; const c = t.pal; const r = t.radius;
  const [view, setView] = React.useState(start === 'home' ? { v: 'home' } : { v: 'day', n: CABIN.days.find(d => d.loose).n });
  const day = view.n != null ? cabinDay(view.n) : null;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: c.ink }}>
      {view.v === 'home' && <>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 6px' }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2, color: c.faint, textTransform: 'uppercase' }}>Looking back</span>
        </div>
        <FinHome lens={lens} c={c} r={r} onOpenDay={n => setView({ v: 'day', n })} onArchive={() => setView({ v: 'archive' })} />
      </>}
      {view.v === 'day' && <FinDaySettle lens={lens} c={c} r={r} day={day} onBack={() => setView({ v: 'home' })} onKeep={(d, pooled) => setView({ v: 'kept', pooled })} />}
      {view.v === 'kept' && <FinKept lens={lens} c={c} r={r} pooled={view.pooled} onBook={() => setView({ v: 'home' })} onDone={() => setView({ v: 'home' })} />}
      {view.v === 'archive' && <FinArchive lens={lens} c={c} r={r} onBack={() => setView({ v: 'home' })} />}
    </div>
  );
}

// ── archive-at-scale: a whole cold trip, calm guided pass ────────
function FinArchive({ lens, c, r, onBack }) {
  const q = CH2_COPY;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px 8px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><Ic.left s={22} c={c.ink} /></button>
        <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.2, color: c.faint, textTransform: 'uppercase' }}>{ARCHIVE.title} · {ARCHIVE.sub}</span>
      </div>
      <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 24px' }}>
        <div style={{ borderRadius: r, overflow: 'hidden' }}><Photo ratio={16 / 9} tint={ARCHIVE.tint} radius={0} grain /></div>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 22, fontWeight: 600, letterSpacing: -0.4, color: c.ink, marginTop: 14, lineHeight: 1.3, fontStyle: lens === 'aurelia' ? 'italic' : 'normal', textWrap: 'pretty' }}>{q.archiveDoor[lens]}</div>
        <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: c.muted, marginTop: 9 }}>{q.archiveLead[lens]}</div>
        {/* material-led: strongest days first, as invitations not a checklist */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['Day 3 · the castle', '31 photos', '#5E6E86'], ['Day 5 · the parade', '24 photos', '#7A5E6E'], ['Day 1 · arrival', '18 photos', '#6E7A5E']].map(([ttl, n, tint]) => (
            <button key={ttl} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${c.line}`, background: c.bg2, cursor: 'pointer', borderRadius: r - 4, padding: 8, textAlign: 'left' }}>
              <div style={{ width: 54, height: 54, borderRadius: r - 8, overflow: 'hidden', flexShrink: 0 }}><Photo ratio={1} tint={tint} radius={0} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.fraunces, fontSize: 15, fontWeight: 600, color: c.ink }}>{ttl}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: c.faint, marginTop: 3 }}>{n} · {lens === 'aurelia' ? 'tap to name a few' : 'tap to name a few'}</div>
              </div>
              <Ic.right s={16} c={c.faint} />
            </button>
          ))}
        </div>
        <div style={{ fontFamily: FONTS.inter, fontSize: 11.5, fontStyle: 'italic', color: c.faint, textAlign: 'center', marginTop: 18 }}>{q.doorSub[lens]}</div>
      </div>
    </div>
  );
}

// ── Aurelia's authorship: pick the day's picture ─────────────────
function FinAureliaPick({ only }) {
  const lens = 'aurelia'; const c = TRAVELERS.aurelia.pal; const r = TRAVELERS.aurelia.radius;
  const [picked, setPicked] = React.useState(null);
  const shots = ALBUM.filter(p => p.author === 'aurelia' && p.kind === 'photo').slice(0, 6);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: c.ink }}>
      <div style={{ flexShrink: 0, padding: '6px 18px 8px' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.2, color: c.faint, textTransform: 'uppercase' }}>sun aug 11 · race point</div>
        <div style={{ fontFamily: FONTS.instrument, fontSize: 24, fontStyle: 'italic', color: c.ink, marginTop: 2 }}>{picked ? CH2_COPY.pickDone.aurelia : CH2_COPY.pickPrompt.aurelia}</div>
      </div>
      <div className="ft-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {shots.map(p => (
            <button key={p.id} onClick={() => setPicked(p.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, position: 'relative' }}>
              <div style={{ borderRadius: r, overflow: 'hidden', boxShadow: picked === p.id ? `0 0 0 3px ${c.accent}` : 'none' }}><Photo ratio={1} tint={p.tint} radius={0} grain /></div>
              {picked === p.id && <div style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.check s={15} c={c.accentInk} /></div>}
            </button>
          ))}
        </div>
        {picked && <div style={{ marginTop: 16, fontFamily: FONTS.inter, fontSize: 12, color: c.muted, lineHeight: 1.5, textAlign: 'center', fontStyle: 'italic' }}>it drives the day chip, the look-back card, and the book page. one tap.</div>}
      </div>
    </div>
  );
}

Object.assign(window, { FinishApp, FinHome, FinDaySettle, FinKept, FinArchive, FinAureliaPick, GOLD, GOLD_SOFT });
