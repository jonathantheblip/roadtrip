// src/claude-chat.jsx — Chat surface screens
// 1) Entry points (FAB on trips list, in-trip header icon)
// 2) Conversation rendering — guidance mode (Helen, serif-warm)
// 3) Conversation rendering — execute mode (Helen, terse)
// 4) Voice input — recording + transcript preview
// 5) Image input — pasted screenshot, Claude's read

// ─────────────────────────────────────────────────────────────
// ENTRY POINT 1 — Trips list with global "Plan a trip with Claude" FAB
// ─────────────────────────────────────────────────────────────
function CL_TripsListWithFab() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', position: 'relative' }}>
      <ScreenHeader theme={t} eyebrow="THE JACKSON FAMILY" right="⚙" />
      <div style={{ padding: '4px 18px 12px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 38, fontWeight: 700, lineHeight: 0.95, letterSpacing: -0.5 }}>Trips</div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontStyle: 'italic', color: t.inkMuted, marginTop: 6 }}>
          An archive, and a planning surface for what comes next.
        </div>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      {/* In planning */}
      <div style={{ padding: '14px 18px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow color={t.accent} style={{ fontWeight: 600 }}>● IN PLANNING</Eyebrow>
          <AuditPill count={3} theme={t} />
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, lineHeight: 1.05, marginTop: 8, letterSpacing: -0.3 }}>
          Rafa's 5th Birthday Weekend
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 4 }}>
          May 1 – 3 · A long weekend in New York
        </div>
        <PhotoPlaceholder ratio={16/9} radius={10} tint="#cbb89c" style={{ marginTop: 10 }} label="HERO" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <AvatarStack ids={['jonathan','helen','aurelia','rafa']} size={18} />
          <Eyebrow color={t.inkMuted}>10 MEMORIES</Eyebrow>
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '14px 18px' }} />
      <div style={{ padding: '0 18px 18px' }}>
        <Eyebrow color={t.inkMuted}>ARCHIVED · APRIL 17 – 24</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 20, fontWeight: 700, lineHeight: 1.05, marginTop: 6, color: t.inkMuted }}>
          The Jackson Family Drive
        </div>
      </div>

      {/* Unified Claude entry — same round-icon shape used in the in-trip header.
          Floating variant carries a soft shadow so it reads as overlay, not chrome. */}
      <div style={{ position: 'absolute', right: 18, bottom: 96, zIndex: 10 }}>
        <ClaudeEntryButton theme={t} floating label="Plan with Claude" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT 2 — In-trip header with Claude icon ("Modify this trip")
// ─────────────────────────────────────────────────────────────
function CL_InTripEntry() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', position: 'relative' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 1.2, color: t.inkMuted }}>← TRIPS</span>
        <Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClaudeEntryButton theme={t} badge={3} label="Modify this trip with Claude" />
          <span style={{ color: t.inkMuted }}>···</span>
        </div>
      </div>

      <div style={{ padding: '6px 18px 6px' }}>
        <Eyebrow color={t.accent} style={{ fontWeight: 600 }}>● MAY 1 – 3 · IN PLANNING</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 24, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: -0.4 }}>
          Rafa's 5th Birthday Weekend
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <AuditPill count={3} theme={t} />
          <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>· BELMONT → NYC</span>
        </div>
      </div>

      {/* Hint card under header */}
      <div style={{
        margin: '8px 18px 0', padding: '12px 14px',
        background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 12,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(46,93,58,0.10)', color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ClaudeMark size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontStyle: 'italic', color: t.ink, lineHeight: 1.35 }}>
            Hi Helen — I noticed a few things to review on this trip. Want me to walk you through them, or are you in the middle of something?
          </div>
          <ChipRow theme={t} chips={[
            '"Walk me through it"',
            '"Not now — I\'ll come back"',
            '"Just fix what you can"',
          ]} />
        </div>
      </div>

      {/* Day chips */}
      <div style={{ padding: '12px 18px 4px', display: 'flex', gap: 6 }}>
        {TRIP.days.map(d => (
          <div key={d.n} style={{
            flex: 1, padding: '6px 8px', borderRadius: 10,
            background: d.n === 1 ? t.ink : 'transparent',
            color: d.n === 1 ? t.bg : t.inkMuted,
            border: d.n === 1 ? 'none' : `1px solid ${t.hairline}`,
          }}>
            <div style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, opacity: 0.7 }}>{d.label}</div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600, marginTop: 2 }}>{d.date.split(' ').slice(0,2).join(' ')}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 18px' }}>
        <Eyebrow color={t.inkMuted}>DAY 1 · FRI MAY 1</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 18, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
          Converging in Murray Hill
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 10 }}>
          <Eyebrow color={t.inkMuted}>3:15 PM · LOGISTICS</Eyebrow>
          <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, marginTop: 2 }}>School pickup</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHAT SURFACE — Helen, guidance mode, full conversation
// ─────────────────────────────────────────────────────────────
function CL_ChatGuidance() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      {/* sheet handle */}
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>
          <span style={{ color: t.inkMuted, marginLeft: 6 }}><XIcon size={12} /></span>
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      {/* messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        <UserBubble theme={t} who="helen">
          I don't know what to do Saturday morning before the show. Empire State is "tentative" and I'm not sure.
        </UserBubble>

        <ClaudeBubble theme={t} mode="guidance">
          You've got from breakfast (9 AM at Grand Brasserie) until the matinee at 2 PM. Empire State is a 7-minute walk from your Airbnb, so it's logistically easy — but the line can eat 90 minutes on a Saturday.
          <div style={{ marginTop: 10, fontStyle: 'italic', color: t.inkMuted }}>
            Three things that might fit your family better:
          </div>
        </ClaudeBubble>

        {/* inline options card from Claude */}
        <div style={{ marginLeft: 38, marginBottom: 16 }}>
          {[
            { n: '01', name: 'Bryant Park carousel + Reading Room', why: 'Rafa-paced, free, and ten minutes from the theatre.' },
            { n: '02', name: 'The Morgan Library', why: 'Aurelia would love the manuscripts. Walkable from Murray Hill.' },
            { n: '03', name: 'Keep Empire State, but book the 9 AM "express" tickets', why: 'Skips the line. Pricier, but the views are the views.' },
          ].map(opt => (
            <div key={opt.n} style={{
              padding: 10, marginBottom: 6,
              background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.accent, letterSpacing: 1.2, fontWeight: 700 }}>{opt.n}</span>
                <span style={{ fontFamily: TYPE.serif, fontSize: 13.5, fontWeight: 600, letterSpacing: -0.1 }}>{opt.name}</span>
              </div>
              <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 3, lineHeight: 1.4 }}>
                {opt.why}
              </div>
            </div>
          ))}
        </div>

        <ClaudeBubble theme={t} mode="guidance">
          Want me to look closer at any of these? Or have a different shape of morning in mind?
        </ClaudeBubble>
      </div>

      <ChatComposer theme={t} placeholder="tell me more, or pick one…" mode="guidance" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHAT SURFACE — Helen, execute mode, draft card inline
// ─────────────────────────────────────────────────────────────
function CL_ChatExecute() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>
          <span style={{ color: t.inkMuted, marginLeft: 6 }}><XIcon size={12} /></span>
        </div>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        <UserBubble theme={t} who="helen">
          Add Sift Bake Shop to Sunday morning, 8am, before the Monster Trucks.
        </UserBubble>

        <ClaudeBubble theme={t} mode="execute" label="EXECUTE · DRAFTED">
          Drafted. Mystic, CT — about 50 min off the route to Bridgeport. Tap save when you're ready.
        </ClaudeBubble>

        <div style={{ marginLeft: 38 }}>
          <ConfirmCard
            theme={t}
            action="add"
            eyebrow="DAY 3 · SUN MAY 3"
            hero={<PhotoPlaceholder ratio={16/9} radius={8} tint="#d6c5a8" label="SIFT BAKE SHOP" />}
            title="Sift Bake Shop"
            fields={[
              { label: 'Time', value: '8:00 AM' },
              { label: 'Address', value: '5 Water St, Mystic CT' },
              { label: 'Kind', value: 'Breakfast', serif: true },
              { label: 'Detour from route', value: '+18 min', readonly: true },
            ]}
            note="Closes at 5 PM. I checked their hours for that Sunday — open."
          />
        </div>

        <ClaudeBubble theme={t} mode="execute">
          Want me to do anything else?
        </ClaudeBubble>
      </div>

      <ChatComposer theme={t} placeholder="ask claude…" mode="execute" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VOICE INPUT — recording + edit-before-send
// ─────────────────────────────────────────────────────────────
function CL_VoiceRecording() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <span style={{ color: t.inkMuted }}><XIcon size={12} /></span>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        <ClaudeBubble theme={t} mode="guidance">
          What can I help with?
        </ClaudeBubble>
      </div>

      {/* Recording sheet — replaces composer */}
      <div style={{
        margin: '0 14px 12px', padding: 16,
        background: t.accent, color: '#fff', borderRadius: 18,
        boxShadow: '0 12px 40px rgba(46,93,58,0.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'blink 1s infinite' }} />
            <span style={{ fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 1.4 }}>LISTENING</span>
          </div>
          <span style={{ fontFamily: TYPE.mono, fontSize: 14, fontWeight: 600 }}>0:12</span>
        </div>

        <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 38, marginBottom: 12 }}>
          {Array.from({length: 32}).map((_,i)=>{
            const h = 6 + Math.abs(Math.sin(i*0.7)) * 30;
            return <div key={i} style={{ flex: 1, height: h, background: '#fff', opacity: i < 24 ? 0.95 : 0.35, borderRadius: 1 }} />;
          })}
        </div>

        <div style={{
          padding: '8px 10px', background: 'rgba(255,255,255,0.12)', borderRadius: 10,
          fontFamily: TYPE.serif, fontSize: 13.5, lineHeight: 1.4, fontStyle: 'italic', marginBottom: 12,
        }}>
          "Move the Mystic Aquarium stop to eleven and add another half hour
          <span style={{ display: 'inline-block', width: 1.5, height: 14, background: '#fff', marginLeft: 2, animation: 'blink 0.8s infinite' }} />"
        </div>
        <div style={{ fontFamily: TYPE.mono, fontSize: 9, opacity: 0.7, letterSpacing: 1, marginBottom: 10 }}>
          TRANSCRIBING LIVE · WHISPER
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, height: 36, borderRadius: 18, border: '1px solid rgba(255,255,255,0.45)', background: 'transparent', color: '#fff', fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12 }}>
            Cancel
          </button>
          <button style={{ flex: 2, height: 36, borderRadius: 18, border: 'none', background: '#fff', color: t.accent, fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12 }}>
            Stop · Edit · Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IMAGE INPUT — paste/drop, Claude reads it, conversation only
// ─────────────────────────────────────────────────────────────
function CL_ChatImage() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <span style={{ color: t.inkMuted }}><XIcon size={12} /></span>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        <UserBubble theme={t} who="helen" attach={
          <div style={{
            width: 180, borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${t.hairline}`, background: t.surface,
          }}>
            <PhotoPlaceholder ratio={4/5} radius={0} tint="#e8d8b8" label="MENU · PASTA & CO" />
          </div>
        }>
          spotted this on Instagram — looks good?
        </UserBubble>

        <ClaudeBubble theme={t} mode="guidance" label="READING IMAGE">
          That's a menu from <strong style={{ fontWeight: 700 }}>Pasta &amp; Co.</strong> — looks like the Mulberry St. location. Italian, sit-down, prix-fixe weeknights.
          <div style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 8,
            background: t.dark ? 'rgba(237,230,214,0.05)' : 'rgba(46,93,58,0.05)',
            fontStyle: 'italic', fontSize: 12.5, color: t.inkMuted, lineHeight: 1.4,
          }}>
            <Eyebrow color={t.inkFaint} style={{ marginBottom: 4 }}>WHAT I SEE</Eyebrow>
            Pappardelle al ragù, cacio e pepe, two pizzas, dessert tasting. Prices look around $22–28 per plate. No kids' menu visible, but cacio e pepe will work for Rafa.
          </div>
          <div style={{ marginTop: 10, color: t.ink, fontSize: 13.5 }}>
            Want me to add it as a dinner stop somewhere this trip?
          </div>
          <ChipRow theme={t} chips={[
            '"Yes — Saturday dinner"',
            '"Save for next time"',
            '"Anything similar walking distance from the Airbnb?"',
          ]} />
        </ClaudeBubble>
      </div>

      <ChatComposer theme={t} placeholder="ask claude…" mode="guidance" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IN-TRIP, SUBSEQUENT OPEN — hint card suppressed.
// The audit pill in the header carries the persistent signal.
// Tap the pill → opens the audit report (covered in section 05).
// ─────────────────────────────────────────────────────────────
function CL_InTripEntryRepeat() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', position: 'relative' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 1.2, color: t.inkMuted }}>← TRIPS</span>
        <Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClaudeEntryButton theme={t} badge={3} label="Modify this trip with Claude" />
          <span style={{ color: t.inkMuted }}>···</span>
        </div>
      </div>

      <div style={{ padding: '6px 18px 6px' }}>
        <Eyebrow color={t.accent} style={{ fontWeight: 600 }}>● MAY 1 – 3 · IN PLANNING</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 24, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: -0.4 }}>
          Rafa's 5th Birthday Weekend
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <AuditPill count={3} theme={t} />
          <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>· BELMONT → NYC</span>
        </div>
      </div>

      <div style={{ padding: '14px 18px 4px', display: 'flex', gap: 6 }}>
        {TRIP.days.map(d => (
          <div key={d.n} style={{
            flex: 1, padding: '6px 8px', borderRadius: 10,
            background: d.n === 1 ? t.ink : 'transparent',
            color: d.n === 1 ? t.bg : t.inkMuted,
            border: d.n === 1 ? 'none' : `1px solid ${t.hairline}`,
          }}>
            <div style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, opacity: 0.7 }}>{d.label}</div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600, marginTop: 2 }}>{d.date.split(' ').slice(0,2).join(' ')}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 18px' }}>
        <Eyebrow color={t.inkMuted}>DAY 1 · FRI MAY 1</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 18, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
          Converging in Murray Hill
        </div>
        {TRIP.days[0].stops.slice(0, 2).map(s => (
          <div key={s.id} style={{ marginTop: 10, padding: '10px 12px', background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 10 }}>
            <Eyebrow color={t.inkMuted}>{s.time} · {s.kind}</Eyebrow>
            <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, marginTop: 2, letterSpacing: -0.2 }}>{s.title}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 18px 20px', fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
        HINT CARD ALREADY SEEN THIS SESSION · TAP PILL TO RE-OPEN
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODE TRANSITION — the "MODE · EXECUTE" cue rendered ONLY on
// the turn where the conversation pivots. Helen had been thinking
// out loud; she says "just do it" and Claude pivots.
// ─────────────────────────────────────────────────────────────
function CL_ChatModeTransition() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>
          <span style={{ color: t.inkMuted, marginLeft: 6 }}><XIcon size={12} /></span>
        </div>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        {/* prior guidance turn, faded to set context */}
        <div style={{ opacity: 0.55 }}>
          <ClaudeBubble theme={t} mode="guidance">
            …the Bryant Park option is the quietest — Aurelia can read, Rafa can ride the carousel twice and we still walk to the theatre.
          </ClaudeBubble>
        </div>

        <UserBubble theme={t} who="helen">just do it. pick bryant park.</UserBubble>

        {/* THE transition turn — modeShift renders the tag above */}
        <ClaudeBubble theme={t} mode="execute" modeShift="execute">
          Locked. Two changes drafted: drop "Empire State (tentative)," add Bryant Park 11 AM → 1 PM.
        </ClaudeBubble>

        <div style={{ marginLeft: 38, marginBottom: 14 }}>
          <ConfirmCard
            theme={t}
            action="add"
            eyebrow="DAY 2 · SAT MAY 2"
            title="Bryant Park · carousel + Reading Room"
            fields={[
              { label: 'Time', value: '11:00 AM – 1:00 PM' },
              { label: 'Address', value: '6th Ave at 41st St', readonly: true },
              { label: 'Replaces', value: 'Empire State (tentative)', strike: 'cut' },
            ]}
            note="Walking time to theatre: 9 min. Lunch at the park kiosks works for Rafa."
            askInline={false}
            dense
          />
        </div>

        {/* a follow-up execute turn — NO modeShift tag, same mode */}
        <ClaudeBubble theme={t} mode="execute">
          Save when ready. Want to lock down Sunday too, or leave it?
        </ClaudeBubble>
      </div>

      <ChatComposer theme={t} placeholder='or say "help me think"' mode="execute" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE VOICE — the second, smaller voice affordance.
// Used inside a confirmation card field. Companion to the full
// takeover panel (CL_VoiceRecording). Shown here in two states
// side-by-side: idle and recording.
// ─────────────────────────────────────────────────────────────
function CL_VoiceInline() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', padding: '14px 18px' }}>
      <Eyebrow color={t.inkMuted}>INLINE VOICE · FIELD-LEVEL</Eyebrow>
      <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, marginTop: 6, letterSpacing: -0.4, lineHeight: 1.05 }}>
        Voice, but smaller
      </div>
      <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
        Captioning a photo, naming a stop, editing a description. Same Whisper, no takeover panel.
      </div>

      <Hairline color={t.ink} style={{ margin: '14px 0' }} />

      <Eyebrow color={t.inkMuted}>IDLE</Eyebrow>
      <div style={{ marginTop: 6, marginBottom: 14 }}>
        <InlineVoiceField
          theme={t}
          label="NOTES"
          ghost="kid-friendly, sourdough, get the morning bun"
          recording={false}
          multiline
        />
      </div>

      <Eyebrow color={t.inkMuted}>RECORDING · LIVE TRANSCRIPT IN-PLACE</Eyebrow>
      <div style={{ marginTop: 6, marginBottom: 14 }}>
        <InlineVoiceField
          theme={t}
          label="NOTES"
          value="Family-friendly bakery, sourdough."
          ghost="get the morning bun"
          recording
          multiline
        />
      </div>

      <Eyebrow color={t.inkMuted}>IN CONTEXT · ON A CONFIRMATION CARD</Eyebrow>
      <div style={{
        marginTop: 6,
        background: '#F8F4E9',
        border: `1px solid rgba(178,128,40,0.22)`,
        borderRadius: 14, padding: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent }} />
            <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: t.accent, fontWeight: 600 }}>
              Draft · add
            </span>
          </div>
          <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>SIFT BAKE SHOP</span>
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          Sift Bake Shop
        </div>
        <InlineVoiceField
          theme={t}
          label="NOTES"
          value="Family-friendly bakery, sourdough."
          ghost="get the morning bun before they sell out"
          recording
          multiline
        />
        <div style={{ marginTop: 10, fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
          TAP MIC TO COMMIT TRANSCRIPT · X TO CANCEL · NO OVERLAY
        </div>
      </div>

      <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 8, background: t.surface, border: `1px solid ${t.hairline}` }}>
        <Eyebrow color={t.inkMuted}>WHEN TO USE WHICH</Eyebrow>
        <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontFamily: TYPE.serif, fontSize: 12, color: t.inkMuted, lineHeight: 1.5 }}>
          <li><strong style={{ color: t.ink, fontWeight: 700 }}>Takeover panel</strong> — composer mic, "tell Claude something." Conversational.</li>
          <li><strong style={{ color: t.ink, fontWeight: 700 }}>Inline field</strong> — anywhere a single field is being filled. Captions, descriptions, names.</li>
        </ul>
      </div>
    </div>
  );
}

Object.assign(window, {
  CL_TripsListWithFab, CL_InTripEntry, CL_InTripEntryRepeat,
  CL_ChatGuidance, CL_ChatExecute, CL_ChatModeTransition,
  CL_VoiceRecording, CL_VoiceInline, CL_ChatImage,
});
