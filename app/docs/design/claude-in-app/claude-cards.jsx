// src/claude-cards.jsx — Confirmation card system variants
// Showcases the ONE pattern stretched across the actions Helen will see most:
// 1) ADD — new stop, with hero
// 2) MOVE — old → new value visible (strike-through)
// 3) CANCEL — destructive, requires extra confirm
// 4) MULTI-EDIT — Claude proposes several edits at once, batched
// 5) AUDIT-FIX — flag-resolution path
// 6) WEATHER CONTINGENCY — conversation prompt (NOT a card — by spec)

// A focused screen that's just the chat surface with the card center-stage.
function CardScreenShell({ theme: t, header, body, footer }) {
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {header}
          <span style={{ color: t.inkMuted, marginLeft: 6 }}><XIcon size={12} /></span>
        </div>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>{body}</div>
      {footer || <ChatComposer theme={t} placeholder="ask claude…" />}
    </div>
  );
}

// 1) ADD — full card with hero
function CL_CardAdd() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>} body={
      <>
        <UserBubble theme={t} who="helen">add sift bake shop sunday morning</UserBubble>
        <ClaudeBubble theme={t} mode="execute" label="DRAFTED">
          On it. 8 AM stop in Mystic, CT — fits between the Airbnb checkout and the arena.
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
              { label: 'Kind', value: 'Breakfast', serif: true },
              { label: 'Address', value: '5 Water St, Mystic CT' },
              { label: 'Notes', value: 'Family-friendly bakery, sourdough + pastries', serif: true },
              { label: 'Detour from route', value: '+18 min', readonly: true },
            ]}
            note="Open Sun · 7 AM – 5 PM (verified)."
          />
        </div>
      </>
    } />
  );
}

// 2) MOVE — shows old vs. new
function CL_CardMove() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>} body={
      <>
        <UserBubble theme={t} who="helen">move mystic aquarium to 11</UserBubble>
        <ClaudeBubble theme={t} mode="execute">
          Moved. That bumps the lunch stop too — flagged below.
        </ClaudeBubble>
        <div style={{ marginLeft: 38 }}>
          <ConfirmCard
            theme={t}
            action="move"
            eyebrow="DAY 3 · MYSTIC AQUARIUM"
            title="Move stop to 11:00 AM"
            fields={[
              { label: 'Time', value: '11:00 AM', strike: '9:30 AM' },
              { label: 'Duration', value: '2 hr 30 min', strike: '2 hr' },
              { label: 'Lunch at Sea Swirl', value: '1:30 PM', strike: '12:00 PM', readonly: false },
            ]}
            note="The lunch shift is automatic — Sea Swirl opens at 11. Tell me if you'd rather drop lunch."
          />
        </div>
      </>
    } />
  );
}

// 3) CANCEL — destructive
function CL_CardCancel() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>} body={
      <>
        <UserBubble theme={t} who="helen">cancel saturday dinner. we'll figure it out.</UserBubble>
        <ClaudeBubble theme={t} mode="execute">
          Got it.
        </ClaudeBubble>
        <div style={{ marginLeft: 38 }}>
          <div style={{
            background: 'rgba(163,58,46,0.06)',
            border: `1px solid rgba(163,58,46,0.22)`,
            borderRadius: 14, padding: 12, marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A33A2E' }} />
                <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: '#A33A2E', fontWeight: 600 }}>
                  Draft · Cancel stop
                </span>
              </div>
              <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>NOT SAVED</span>
            </div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 17, fontWeight: 600, letterSpacing: -0.2, marginBottom: 4 }}>
              Remove Saturday dinner
            </div>
            <div style={{
              fontFamily: TYPE.serif, fontSize: 12.5, fontStyle: 'italic', color: t.inkMuted,
              marginBottom: 10, lineHeight: 1.4, textDecoration: 'line-through', textDecorationColor: t.inkFaint,
            }}>
              Carbone, 6:30 PM · 181 Thompson St
            </div>
            <div style={{
              padding: '6px 8px', borderRadius: 8, marginBottom: 10,
              background: 'rgba(163,58,46,0.08)', color: '#A33A2E',
              fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.35,
            }}>
              You have a 4-week reservation here. Cancelling won't notify the restaurant — you'd need to call OpenTable separately.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{
                flex: 2, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#A33A2E', color: '#fff', fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><XIcon size={11} /> Cancel stop</button>
              <button style={{
                flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', background: 'transparent', color: t.ink,
                border: `1px solid ${t.hairline}`, fontFamily: TYPE.sans, fontWeight: 500, fontSize: 12,
              }}>Keep it</button>
            </div>
          </div>
        </div>
      </>
    } />
  );
}

// 4) MULTI-EDIT — Claude proposes a batch of changes
function CL_CardMultiEdit() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>RAFA'S 5TH</Eyebrow>} body={
      <>
        <UserBubble theme={t} who="helen">we want sunday to be more relaxed. push everything back an hour and cut whatever's most skippable.</UserBubble>
        <ClaudeBubble theme={t} mode="execute">
          Three changes for Sunday. I kept the Monster Trucks anchor untouched.
        </ClaudeBubble>
        <div style={{ marginLeft: 38, marginBottom: 14 }}>
          <div style={{
            background: '#F8F4E9',
            border: `1px solid rgba(178,128,40,0.22)`,
            borderRadius: 14, padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent }} />
                <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: t.accent, fontWeight: 600 }}>
                  Draft · 3 edits batched
                </span>
              </div>
              <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>SUN MAY 3</span>
            </div>

            {[
              { tag: 'MOVE', title: 'Sift Bake Shop', from: '8:00 AM', to: '9:00 AM', tone: '#8A6F2D' },
              { tag: 'MOVE', title: 'Mystic Aquarium', from: '9:30 AM', to: '11:00 AM', tone: '#8A6F2D' },
              { tag: 'CUT',  title: 'Stop at Lobster Roll Co.', note: 'Most skippable — overlaps with arena snacks.', tone: '#A33A2E' },
            ].map((e, i) => (
              <div key={i} style={{
                padding: '8px 10px',
                borderBottom: i < 2 ? `1px solid ${t.hairline}` : 'none',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{
                  fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, color: e.tone, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.04)',
                  marginTop: 2, flexShrink: 0,
                }}>{e.tag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: TYPE.serif, fontSize: 13.5, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                  {e.from ? (
                    <div style={{ fontFamily: TYPE.sans, fontSize: 11.5, color: t.inkMuted, marginTop: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: t.inkFaint }}>{e.from}</span>
                      <span style={{ margin: '0 5px' }}>→</span>
                      <span style={{ color: t.ink, fontWeight: 600 }}>{e.to}</span>
                    </div>
                  ) : (
                    <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
                      {e.note}
                    </div>
                  )}
                </div>
                <button style={{
                  background: 'transparent', border: 'none', color: t.inkMuted,
                  fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                  cursor: 'pointer', padding: 4, flexShrink: 0,
                }}>Skip</button>
              </div>
            ))}

            <div style={{
              marginTop: 10, padding: '6px 8px', borderRadius: 8,
              background: 'rgba(178,128,40,0.10)', color: '#8A6F2D',
              fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.35,
            }}>
              Arena entry is 2 PM — even with the shift, you'll arrive 30 min early.
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button style={{
                flex: 2, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: t.accent, color: '#fff', fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><CheckIcon size={11} /> Save all 3</button>
              <button style={{
                flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', background: 'transparent', color: t.ink,
                border: `1px solid ${t.hairline}`, fontFamily: TYPE.sans, fontWeight: 500, fontSize: 12,
              }}>Review each</button>
            </div>
          </div>
        </div>
      </>
    } />
  );
}

// 5) AUDIT-FIX — coming from a flag tap
function CL_CardAuditFix() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>FIX FLAG</Eyebrow>} body={
      <>
        <div style={{
          padding: '8px 10px', marginBottom: 12,
          background: 'rgba(178,128,40,0.10)', borderRadius: 10,
          border: `1px solid rgba(178,128,40,0.22)`,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <AlertIcon size={14} />
          <div style={{ flex: 1 }}>
            <Eyebrow color="#8A6F2D" style={{ fontWeight: 600 }}>PASSIVE FLAG · DAY 3</Eyebrow>
            <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              Driving leg 2:42 → 2:50 to arena
            </div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>
              That's the second longest leg of the trip. Jonathan flagged 2.5 hr as the family limit.
            </div>
          </div>
        </div>

        <ClaudeBubble theme={t} mode="guidance">
          Two ways to bring this back inside Jonathan's rule:
        </ClaudeBubble>

        <div style={{ marginLeft: 38, marginBottom: 14 }}>
          {[
            { n: 'A', title: 'Add a stop in New Haven (~halfway)', sub: 'Coffee + bathroom. Adds 25 min total.' },
            { n: 'B', title: 'Leave Mystic 30 min earlier', sub: 'Less rest at Sea Swirl. Trims 8 min off net.' },
          ].map(o => (
            <div key={o.n} style={{
              padding: 10, marginBottom: 6, background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: 'rgba(46,93,58,0.10)', color: t.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: TYPE.mono, fontSize: 11, fontWeight: 700,
              }}>{o.n}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{o.title}</div>
                <div style={{ fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, marginTop: 1 }}>{o.sub}</div>
              </div>
              <ChevronIcon size={12} />
            </div>
          ))}
        </div>

        <ClaudeBubble theme={t} mode="guidance">
          Or tell me a third way and I'll draft it.
        </ClaudeBubble>
      </>
    } />
  );
}

// 6) WEATHER CONTINGENCY — by spec, NOT a card. Plain conversation prompt.
function CL_WeatherProactive() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>ASHEVILLE · APR 14</Eyebrow>} body={
      <>
        <ClaudeBubble theme={t} mode="guidance" label="HEADS UP — NOT A DRAFT">
          There's a real chance of rain Saturday in Asheville — Open-Meteo currently calls it 62% likely between 10 AM and 3 PM.
          <div style={{
            margin: '10px 0', padding: '10px 12px', borderRadius: 10,
            background: t.dark ? 'rgba(237,230,214,0.05)' : 'rgba(46,93,58,0.05)',
            border: `1px solid ${t.hairline}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Eyebrow color={t.inkMuted}>YOUR ANCHOR THAT DAY</Eyebrow>
              <CloudRainIcon size={14} />
            </div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontWeight: 600 }}>Linville Falls hike</div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, marginTop: 2 }}>
              Outdoor · 2 hours · scheduled 10 AM
            </div>
          </div>
          <div>
            Want me to draft an indoor alternative we can swap to <em>if</em> needed? I won't change anything until you tell me to.
          </div>
          <ChipRow theme={t} chips={[
            '"Yes, draft something I can hold in reserve"',
            '"Not yet — let\'s see the forecast closer to the day"',
          ]} />
        </ClaudeBubble>

        <div style={{
          marginLeft: 38, fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, color: t.inkFaint,
        }}>
          CONTINGENCY · 7 DAYS OUT · WILL RE-CHECK NIGHTLY
        </div>
      </>
    } />
  );
}

Object.assign(window, {
  CL_CardAdd, CL_CardMove, CL_CardCancel, CL_CardMultiEdit, CL_CardAuditFix, CL_WeatherProactive,
  CL_CardContingency, CL_DayWithStandby,
});

// ─────────────────────────────────────────────────────────────
// 7) CONTINGENCY · the accept path. Helen says "yes draft something."
// A conditional activity attaches to the day with a `triggers_on` field.
// The day still renders the anchor; the standby sits dormant in the model.
// ─────────────────────────────────────────────────────────────
function CL_CardContingency() {
  const t = TRAVELERS.helen.theme;
  return (
    <CardScreenShell theme={t} header={<Eyebrow color={t.inkMuted}>ASHEVILLE · APR 14</Eyebrow>} body={
      <>
        <UserBubble theme={t} who="helen">yes — draft a rain plan i can hold in reserve.</UserBubble>
        <ClaudeBubble theme={t} mode="execute" modeShift="execute">
          Drafted. Conditional attached to Saturday — Linville Falls stays the anchor; the museum sits dormant until the trigger fires.
        </ClaudeBubble>

        <div style={{ marginLeft: 38 }}>
          <div style={{
            background: '#F8F4E9',
            border: `1px solid rgba(178,128,40,0.22)`,
            borderRadius: 14, padding: 12, marginBottom: 14,
          }}>
            {/* header strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudRainIcon size={11} />
                <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: '#7A3E91', fontWeight: 600 }}>
                  Draft · Standby plan
                </span>
              </div>
              <span style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>SAT APR 13 · 10 AM</span>
            </div>

            {/* anchor → standby relationship, shown explicitly */}
            <div style={{
              padding: 8, borderRadius: 8, marginBottom: 10,
              background: t.surface, border: `1px solid ${t.hairline}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eyebrow color={t.inkMuted}>ANCHOR</Eyebrow>
                <div style={{ flex: 1, fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600 }}>Linville Falls hike</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${t.hairline}` }}>
                <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, color: '#7A3E91', fontWeight: 700 }}>STANDBY</span>
                <div style={{ flex: 1, fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600 }}>NC Asheville Art Museum</div>
              </div>
            </div>

            <div style={{
              border: `1px solid ${t.hairline}`, borderRadius: 10,
              background: 'rgba(255,255,255,0.7)', overflow: 'hidden', marginBottom: 8,
            }}>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${t.hairline}` }}>
                <div style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, color: t.inkFaint, marginBottom: 2, textTransform: 'uppercase' }}>
                  Standby venue
                </div>
                <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontWeight: 500 }}>NC Asheville Art Museum</div>
                <div style={{ fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, marginTop: 2 }}>
                  Walkable from the Airbnb · open Sat 11 AM – 6 PM
                </div>
              </div>
              <div style={{ padding: '8px 10px', borderBottom: `1px solid ${t.hairline}` }}>
                <div style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, color: t.inkFaint, marginBottom: 4, textTransform: 'uppercase' }}>
                  Triggers when
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { Icon: CloudRainIcon, text: 'Forecast > 60% rain · morning of', on: true },
                    { Icon: DotsIcon, text: 'I tap "switch to rain plan"', on: true },
                  ].map((tr, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        background: tr.on ? '#7A3E91' : t.surfaceAlt,
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{tr.on && <CheckIcon size={10} />}</span>
                      <tr.Icon size={12} />
                      <span style={{ fontFamily: TYPE.serif, fontSize: 12, color: t.ink }}>{tr.text}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, lineHeight: 1.4 }}>
                  Both checked = automatic on forecast <em>and</em> manual override always available.
                </div>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, color: t.inkFaint, marginBottom: 2, textTransform: 'uppercase' }}>
                  Visible to
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AvatarStack ids={['helen']} size={16} />
                  <span style={{ fontFamily: TYPE.serif, fontSize: 12, fontWeight: 500 }}>Just you · Jonathan won't see the standby</span>
                </div>
              </div>
            </div>

            <div style={{
              padding: '6px 8px', borderRadius: 8, marginBottom: 10,
              background: 'rgba(122,62,145,0.10)', color: '#7A3E91',
              fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.4,
            }}>
              When the trigger fires, Linville Falls becomes hidden and the museum becomes visible — same mechanism as a surprise reveal, different signal.
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{
                flex: 2, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#7A3E91', color: '#fff',
                fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <CheckIcon size={11} /> Save standby
              </button>
              <button style={{
                flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', background: 'transparent', color: t.ink,
                border: `1px solid ${t.hairline}`, fontFamily: TYPE.sans, fontWeight: 500, fontSize: 12,
              }}>Edit triggers</button>
              <button style={{
                width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
                background: 'transparent', color: t.inkMuted,
                border: `1px solid ${t.hairline}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><XIcon size={12} /></button>
            </div>
          </div>
        </div>
      </>
    } />
  );
}

// ─────────────────────────────────────────────────────────────
// 8) DAY WITH STANDBY · Helen's view of how the conditional renders.
// The anchor reads normally. The standby sits below as a soft secondary
// card with an eyebrow that says when it fires. Tap to expand.
// ─────────────────────────────────────────────────────────────
function CL_DayWithStandby() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP</span>
        <Eyebrow color={t.inkMuted}>SAT APR 13</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>
      <div style={{ padding: '4px 18px 8px' }}>
        <Eyebrow color={t.inkMuted}>DAY 2 · SAT APR 13</Eyebrow>
        <div style={{ fontFamily: TYPE.serif, fontSize: 24, fontWeight: 700, lineHeight: 1.05, marginTop: 4, letterSpacing: -0.4 }}>
          Saturday in Asheville
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ padding: '12px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>10:00 AM · ANCHOR</Eyebrow>
      </div>

      {/* anchor stop — renders normally */}
      <div style={{ margin: '0 18px 8px', padding: 12, background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 12, position: 'relative' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>
          Linville Falls hike
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4, lineHeight: 1.35 }}>
          1 hr 12 min drive · 2 hr loop · pack water + the wind shells
        </div>
        <PhotoPlaceholder ratio={16/9} radius={8} tint="#9eaf8a" label="LINVILLE FALLS · OVERLOOK" style={{ marginTop: 10 }} />
      </div>

      {/* standby card — sits below, soft, expanded state shown */}
      <div style={{
        margin: '0 18px 12px', padding: 12,
        borderRadius: 12,
        background: 'rgba(122,62,145,0.05)',
        border: `1px dashed rgba(122,62,145,0.35)`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: '#7A3E91', fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700,
          }}>
            <CloudRainIcon size={11} /> Standby plan · fires if it rains
          </span>
          <ChevronIcon size={12} dir="up" />
        </div>

        <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
          NC Asheville Art Museum
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
          Walkable from Airbnb · open 11 AM – 6 PM · indoor, kid-friendly
        </div>

        <div style={{
          marginTop: 10, padding: '6px 8px', borderRadius: 8,
          background: 'rgba(255,255,255,0.65)',
          fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, color: '#7A3E91', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
        }}>
          <CloudRainIcon size={11} /> Watches forecast nightly · 24% rain Sat now
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button style={{
            flex: 1, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#7A3E91', color: '#fff',
            fontFamily: TYPE.sans, fontWeight: 600, fontSize: 11.5,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>Switch to rain plan now</button>
          <button style={{
            padding: '0 12px', height: 32, borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: t.ink,
            border: `1px solid ${t.hairline}`,
            fontFamily: TYPE.sans, fontWeight: 500, fontSize: 11.5,
          }}>Edit</button>
        </div>
      </div>

      <div style={{ padding: '0 18px 4px', fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
        JONATHAN'S VIEW: SEES THE ANCHOR ONLY · STANDBY HIDDEN
      </div>

      <div style={{ padding: '14px 18px 4px' }}>
        <Eyebrow color={t.inkMuted}>2:00 PM · LUNCH</Eyebrow>
      </div>
      <div style={{ margin: '0 18px 18px', padding: 10, background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 10 }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontWeight: 600 }}>Buxton Hall BBQ</div>
      </div>
    </div>
  );
}
