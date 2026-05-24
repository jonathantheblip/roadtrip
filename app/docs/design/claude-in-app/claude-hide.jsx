// src/claude-hide.jsx — Hide/reveal/decoy designs
// 1) Helen's view of a trip with hidden + decoy items (her POV — she sees both)
// 2) Jonathan's view of the SAME trip (he sees the visible, decoy renders as real)
// 3) Visibility menu (the contextual ".." picker)
// 4) "Reveals" page in trip settings — scheduled reveals with triggers
// 5) Reveal moment — the one-time animation when a surprise unlocks (frozen mid-anim)

// ─────────────────────────────────────────────────────────────
// HELEN'S VIEW — she sees the lock icons and the real values
// ─────────────────────────────────────────────────────────────
function CL_HelenViewWithHidden() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIPS</span>
        <Eyebrow color={t.inkMuted}>HELEN'S VIEW</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>

      <div style={{ padding: '4px 18px 4px' }}>
        <Eyebrow color={t.accent} style={{ fontWeight: 600 }}>● APR 12 – 14 · ASHEVILLE</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: -0.3 }}>
          Jonathan's Birthday Weekend
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4 }}>
          2 surprises planned · 1 decoy active
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '8px 18px' }} />

      <div style={{ padding: '8px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>DAY 1 · FRI APR 12</Eyebrow>
      </div>

      {/* normal stop */}
      <StopRow theme={t} time="10:00 AM" kind="DRIVE" title="Boston → Asheville (flight)" />

      {/* hidden stop — Helen sees with lock */}
      <StopRow
        theme={t}
        time="6:30 PM"
        kind="DINNER"
        title="Cúrate (tapas)"
        hiddenFrom={['jonathan']}
        hiddenLabel="HIDDEN FROM J · UNTIL SAT 5 PM"
      />

      {/* decoy stop — Helen sees the real value with strikethrough on decoy */}
      <DecoyRow
        theme={t}
        time="Sat 9 AM"
        kind="ACTIVITY"
        decoy="Coffee at Trade & Lore"
        real="Hot-air balloon ride · Asheville sunrise"
        revealAt="SAT 8 AM · GEO LOCK"
      />

      {/* normal stop */}
      <StopRow theme={t} time="2:00 PM" kind="HIKE" title="Linville Falls" />

      {/* day-level hidden detail */}
      <div style={{ margin: '14px 18px', padding: 10, borderRadius: 10, border: `1px dashed rgba(122,62,145,0.35)`, background: 'rgba(122,62,145,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <VisBadge kind="surprise_location" text="Whole day, hidden from J" theme={t} tone="card" />
          <Eyebrow color={t.inkMuted}>SUN APR 14</Eyebrow>
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, marginTop: 6, letterSpacing: -0.2 }}>
          The Biltmore tour Jonathan doesn't know about
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>
          Reveals when he opens his phone Sunday morning. Day shows as "open" on his side until then.
        </div>
      </div>
    </div>
  );
}

function StopRow({ theme: t, time, kind, title, hiddenFrom, hiddenLabel }) {
  const hidden = hiddenFrom && hiddenFrom.length;
  return (
    <div style={{ margin: '0 18px', padding: '10px 0', borderBottom: `1px solid ${t.hairline}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow color={t.inkMuted}>{time} · {kind}</Eyebrow>
        {hidden && <VisBadge kind="surprise_time" text={hiddenLabel} theme={t} />}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      }}>
        {hidden && <LockIcon size={12} />}
        <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{title}</div>
      </div>
    </div>
  );
}

function DecoyRow({ theme: t, time, kind, decoy, real, revealAt }) {
  return (
    <div style={{
      margin: '6px 18px 0', padding: 10, borderRadius: 10,
      border: `1px dashed rgba(163,58,46,0.35)`,
      background: 'rgba(163,58,46,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Eyebrow color={t.inkMuted}>{time} · {kind}</Eyebrow>
        <VisBadge kind="decoy" text="DECOY · J SEES THIS" theme={t} />
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 500, color: t.inkMuted, textDecoration: 'line-through', textDecorationColor: t.inkFaint }}>
          {decoy}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EyeIcon size={12} />
          <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{real}</div>
        </div>
      </div>
      <div style={{ marginTop: 6, fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
        {revealAt}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// JONATHAN'S VIEW — same trip. He sees the decoy as truth. No locks.
// ─────────────────────────────────────────────────────────────
function CL_JonathanViewSameTrip() {
  const t = TRAVELERS.jonathan.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIPS</span>
        <Eyebrow color={t.inkMuted}>JONATHAN'S VIEW · SAME TRIP</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>

      <div style={{ padding: '4px 18px 4px' }}>
        <Eyebrow color={t.accent} style={{ fontWeight: 600 }}>● APR 12 – 14 · ASHEVILLE</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: -0.3 }}>
          Asheville Weekend
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4 }}>
          Helen built most of this · last edit 2h ago
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '8px 18px' }} />

      <div style={{ padding: '8px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>DAY 1 · FRI APR 12</Eyebrow>
      </div>

      {/* normal stop */}
      <JStopRow theme={t} time="10:00 AM" kind="DRIVE" title="Boston → Asheville (flight)" />

      {/* hidden stop is simply absent — nothing here for the 6:30 PM slot.
          A small "no plans yet" marker keeps the seam invisible. */}
      <JStopRow theme={t} time="Evening" kind="OPEN" title="No plans yet — figure dinner out on arrival" muted />

      {/* decoy stop — Jonathan sees the decoy AS the truth */}
      <JStopRow theme={t} time="Sat 9 AM" kind="COFFEE" title="Coffee at Trade & Lore" />

      <JStopRow theme={t} time="2:00 PM" kind="HIKE" title="Linville Falls" />

      <div style={{ padding: '14px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>SUN APR 14</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontStyle: 'italic', color: t.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
          Open day. Helen's still penciling things in — ask her, or just see what the morning calls for.
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '14px 18px' }} />

      {/* Claude entry shows on Jonathan's side identically */}
      <div style={{ padding: '6px 18px 18px' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: t.surface, border: `1px solid ${t.hairline}`,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(163,58,46,0.18)', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClaudeMark size={13} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontStyle: 'italic', lineHeight: 1.4 }}>
              "Is there anything I should know about Sunday?"
            </div>
            <div style={{ marginTop: 8, fontFamily: TYPE.serif, fontSize: 12, color: t.inkMuted, lineHeight: 1.4, fontStyle: 'italic' }}>
              <span style={{ color: t.accent, fontStyle: 'normal', fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, marginRight: 6 }}>CLAUDE</span>
              I'd ask Helen — she's been working on parts of this trip. Nothing on your view yet for Sunday.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
          NEVER VOLUNTEERS THE EXISTENCE OF HIDDEN CONTENT. NEVER LIES.
        </div>
      </div>
    </div>
  );
}

function JStopRow({ theme: t, time, kind, title, muted }) {
  return (
    <div style={{ margin: '0 18px', padding: '10px 0', borderBottom: `1px solid ${t.hairline}`, opacity: muted ? 0.6 : 1 }}>
      <Eyebrow color={t.inkMuted}>{time} · {kind}</Eyebrow>
      <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: muted ? 500 : 600, letterSpacing: -0.2, marginTop: 4, fontStyle: muted ? 'italic' : 'normal', color: muted ? t.inkMuted : t.ink }}>
        {title}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VISIBILITY MENU — the "..." contextual picker on any item
// ─────────────────────────────────────────────────────────────
function CL_VisibilityMenu() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, position: 'relative' }}>
      {/* dimmed underlay */}
      <div style={{ height: '100%', padding: 18, opacity: 0.4 }}>
        <Eyebrow color={t.inkMuted}>SAT APR 13 · 9:00 AM</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 18, fontWeight: 600, marginTop: 4 }}>
          Hot-air balloon ride
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4 }}>
          Asheville Hot Air Balloons · sunrise lift
        </div>
      </div>

      {/* sheet */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 12,
        background: t.surface, borderRadius: 18,
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        padding: '10px 4px 12px',
        border: `1px solid ${t.hairline}`,
      }}>
        <div style={{ padding: '4px 14px 8px' }}>
          <Eyebrow color={t.inkMuted}>VISIBILITY · HOT-AIR BALLOON RIDE</Eyebrow>
        </div>

        {[
          { Icon: EyeIcon, title: 'Shared with everyone', sub: 'Default — all four travelers see this.', checked: false },
          { Icon: LockIcon, title: 'Hide from Jonathan', sub: "He won't see this item at all.", checked: false },
          { Icon: ClockIcon, title: 'Reveal Sat Apr 13 · 8:00 AM', sub: "Hidden until then, then appears with a soft animation.", checked: false },
          { Icon: PinIcon, title: 'Reveal on arrival at location', sub: "Unlocks when Jonathan's phone hits the geofence (200m).", checked: true },
          { Icon: EyeOffIcon, title: 'Show a decoy until then', sub: '"Coffee at Trade & Lore" renders for Jonathan; replaced on trigger.', checked: true, tone: 'oxblood' },
        ].map((o, i) => (
          <div key={i} style={{
            padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
            borderTop: i === 0 ? 'none' : `1px solid ${t.hairline}`,
            background: o.checked ? (o.tone === 'oxblood' ? 'rgba(163,58,46,0.06)' : 'rgba(122,62,145,0.06)') : 'transparent',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: o.checked ? (o.tone === 'oxblood' ? 'rgba(163,58,46,0.18)' : 'rgba(122,62,145,0.18)') : t.surfaceAlt,
              color: o.checked ? (o.tone === 'oxblood' ? '#A33A2E' : '#7A3E91') : t.inkMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <o.Icon size={11} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: TYPE.sans, fontSize: 12.5, fontWeight: o.checked ? 700 : 600, color: t.ink }}>
                {o.title}
              </div>
              <div style={{ fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>
                {o.sub}
              </div>
            </div>
            {o.checked && <CheckIcon size={14} />}
          </div>
        ))}

        <div style={{ padding: '8px 14px 0' }}>
          <button style={{
            width: '100%', height: 38, borderRadius: 10, border: 'none',
            background: t.ink, color: t.bg, cursor: 'pointer',
            fontFamily: TYPE.sans, fontWeight: 600, fontSize: 13,
          }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REVEALS PAGE — trip settings, scheduled reveals
// ─────────────────────────────────────────────────────────────
function CL_RevealsPage() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP SETTINGS</span>
        <span style={{ color: t.inkMuted }}>＋</span>
      </div>
      <div style={{ padding: '4px 18px 8px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: -0.5 }}>
          Reveals
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontStyle: 'italic', color: t.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
          What you've kept under wraps — and when it surfaces.
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ padding: '12px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>2 SCHEDULED · 1 DECOY ACTIVE · 0 PAST</Eyebrow>
      </div>

      {[
        {
          when: 'SAT APR 13 · 8:00 AM',
          trigger: { kind: 'surprise_location', text: 'Geofence · 200m · Asheville Hot Air' },
          title: 'Hot-air balloon ride',
          decoy: 'Coffee at Trade & Lore',
          for: ['jonathan'],
        },
        {
          when: 'SAT APR 13 · 5:00 PM',
          trigger: { kind: 'surprise_time', text: 'Time-based · automatic' },
          title: 'Cúrate tasting dinner',
          decoy: null,
          for: ['jonathan'],
        },
        {
          when: 'SUN APR 14 · 8:00 AM',
          trigger: { kind: 'surprise_time', text: 'When Jonathan opens his phone' },
          title: 'The Biltmore — surprise day',
          decoy: null,
          for: ['jonathan'],
        },
      ].map((r, i) => (
        <div key={i} style={{
          margin: '0 18px', padding: '12px 0',
          borderBottom: `1px solid ${t.hairline}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Eyebrow color={t.accent}>{r.when}</Eyebrow>
            <Avatar id="jonathan" size={18} />
          </div>
          <div style={{ fontFamily: TYPE.serif, fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>{r.title}</div>
          {r.decoy && (
            <div style={{ marginTop: 4, fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, textDecoration: 'line-through', textDecorationColor: t.inkFaint }}>
              decoy: {r.decoy}
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <VisBadge kind={r.trigger.kind} text={r.trigger.text} theme={t} tone="card" />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{
                padding: '4px 8px', borderRadius: 14, border: `1px solid ${t.hairline}`, background: t.surface,
                fontFamily: TYPE.sans, fontSize: 10, fontWeight: 600, color: t.ink, cursor: 'pointer',
              }}>Edit</button>
              <button style={{
                padding: '4px 8px', borderRadius: 14, border: 'none', background: t.accent, color: '#fff',
                fontFamily: TYPE.sans, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}>Reveal now</button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ padding: '14px 18px 24px' }}>
        <button style={{
          width: '100%', padding: '10px 12px', borderRadius: 10,
          border: `1px dashed ${t.hairline}`, background: 'transparent',
          fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 13, color: t.inkMuted, cursor: 'pointer',
        }}>
          + plan another surprise
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REVEAL MOMENT — the one-time animation when a surprise unlocks
// frozen mid-animation: the decoy fading down, the real value rising in
// ─────────────────────────────────────────────────────────────
function CL_RevealMoment() {
  const t = TRAVELERS.jonathan.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', position: 'relative' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← BACK</span>
        <Eyebrow color={t.inkMuted}>JONATHAN'S VIEW · LIVE</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>

      <div style={{ padding: '4px 18px 8px' }}>
        <Eyebrow color={t.accent}>● SAT APR 13 · 8:02 AM</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: -0.3 }}>
          Saturday in Asheville
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      {/* the revealing item */}
      <div style={{ margin: '14px 18px', padding: 12, borderRadius: 12, background: t.surface, border: `1px solid rgba(178,128,40,0.35)`, position: 'relative', overflow: 'hidden' }}>
        {/* sunrise wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 20% -20%, rgba(229,158,76,0.45), transparent 60%), radial-gradient(circle at 80% 100%, rgba(122,62,145,0.30), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Eyebrow color={t.inkMuted}>9:00 AM · ACTIVITY</Eyebrow>
            <VisBadge kind="revealed" text="HELEN UPDATED THIS" theme={t} tone="card" />
          </div>

          {/* decoy fading away */}
          <div style={{
            fontFamily: TYPE.serif, fontSize: 14, fontWeight: 500,
            color: t.inkFaint, textDecoration: 'line-through',
            textDecorationColor: t.inkFaint, opacity: 0.5,
            marginBottom: 4,
          }}>
            Coffee at Trade &amp; Lore
          </div>

          {/* real value rising in */}
          <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 800, lineHeight: 1.05, letterSpacing: -0.4, color: t.ink }}>
            Hot-air balloon ride
          </div>
          <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontStyle: 'italic', color: t.inkMuted, marginTop: 4 }}>
            Asheville Hot Air Balloons · sunrise lift · be at the field by 8:30
          </div>

          <PhotoPlaceholder ratio={16/9} radius={8} tint="#a78457" label="BALLOON FIELD · SUNRISE" style={{ marginTop: 12 }} />

          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(229,158,76,0.18)', color: '#E59E4C',
            fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.4,
          }}>
            Happy birthday. — Helen
          </div>
        </div>
      </div>

      <div style={{ padding: '0 18px', fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
        ANIMATION · 1.2s · ONE-TIME · NEVER REPLAYS
      </div>
    </div>
  );
}

Object.assign(window, {
  CL_HelenViewWithHidden, CL_JonathanViewSameTrip,
  CL_VisibilityMenu, CL_RevealsPage, CL_RevealMoment,
});
