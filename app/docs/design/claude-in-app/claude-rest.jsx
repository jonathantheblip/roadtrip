// src/claude-rest.jsx — Audit, Settings, States, and Jonathan's view
// 1) Audit report (passive flags expanded)
// 2) Stress-test (active audit) — fuller report
// 3) Settings · Helen
// 4) Settings · Jonathan (gated additions)
// 5) Empty states (first conversation, no audits, no reveals)
// 6) Error states (network drop, timeout, budget hit)
// 7) Jonathan's chat — dark editorial skin

// ─────────────────────────────────────────────────────────────
// 1) Audit report — flags expanded
// ─────────────────────────────────────────────────────────────
function CL_AuditReport() {
  const t = TRAVELERS.helen.theme;
  const flags = [
    { kind: 'route', tone: '#8A6F2D', tag: 'DRIVING', when: 'DAY 3 · 12:15 PM',
      title: 'Mystic → Bridgeport is 2:48',
      sub: 'Above Jonathan\'s 2:30 family limit by 18 min.',
      fix: 'Ask Claude to split this leg',
    },
    { kind: 'venue', tone: '#A33A2E', tag: 'CLOSED', when: 'DAY 2 · 10:30 AM',
      title: 'Empire State Building — observation deck',
      sub: 'Currently shows "closed for elevator maintenance" through May 6 on Google.',
      fix: 'Ask Claude for a swap',
    },
    { kind: 'pace', tone: '#8A6F2D', tag: 'PACING', when: 'DAY 2',
      title: '5 stops with Rafa — last ends 9:42 PM',
      sub: 'You flagged "no past-9 with Rafa" in family settings.',
      fix: 'Ask Claude to trim',
    },
  ];
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP</span>
        <Eyebrow color={t.inkMuted}>3 TO REVIEW</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>
      <div style={{ padding: '4px 18px 8px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: -0.5 }}>
          Things to review
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 13, fontStyle: 'italic', color: t.inkMuted, marginTop: 6 }}>
          I noticed these passing over the trip just now. You decide.
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ padding: '4px 0 24px' }}>
        {flags.map((f, i) => (
          <div key={i} style={{ margin: '0 18px', padding: '14px 0', borderBottom: `1px solid ${t.hairline}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1.4, color: f.tone, fontWeight: 700 }}>● {f.tag}</span>
              <Eyebrow color={t.inkFaint}>{f.when}</Eyebrow>
            </div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 15, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.2 }}>
              {f.title}
            </div>
            <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
              {f.sub}
            </div>
            <button style={{
              marginTop: 10, padding: '6px 10px', borderRadius: 16, background: t.surface,
              border: `1px solid ${t.hairline}`, color: t.ink, cursor: 'pointer',
              fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 12, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <ClaudeMark size={11} color={t.accent} />
              {f.fix}
            </button>
          </div>
        ))}

        <div style={{
          margin: '14px 18px 0', padding: '12px 14px', borderRadius: 12,
          background: t.surface, border: `1px solid ${t.hairline}`,
        }}>
          <Eyebrow color={t.inkMuted}>WANT EVERYTHING CHECKED?</Eyebrow>
          <div style={{ fontFamily: TYPE.serif, fontSize: 13.5, fontWeight: 600, marginTop: 4, letterSpacing: -0.1 }}>
            Stress-test this trip
          </div>
          <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>
            Runs a full audit, including things that aren't normally flagged.
          </div>
          <button style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 10, background: t.ink, color: t.bg,
            border: 'none', cursor: 'pointer',
            fontFamily: TYPE.sans, fontWeight: 600, fontSize: 12,
          }}>Run stress-test</button>
        </div>
      </div>
    </div>
  );
}

// 2) STRESS-TEST — active audit, fuller report
function CL_StressTest() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP</span>
        <Eyebrow color={t.inkMuted}>STRESS-TEST · COMPLETE</Eyebrow>
        <span style={{ color: t.inkMuted }}>···</span>
      </div>
      <div style={{ padding: '4px 18px 8px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: -0.5 }}>
          Stress-test report
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
          Ran 14 checks. 3 flags, 2 quiet notes, 9 cleared.
        </div>
      </div>

      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ padding: '10px 18px 4px' }}>
        <Eyebrow color="#A33A2E" style={{ fontWeight: 600 }}>NEEDS REVIEW · 3</Eyebrow>
      </div>
      {[
        { tag: 'DRIVING', title: 'Mystic → Bridgeport over 2:30' },
        { tag: 'CLOSED', title: 'Empire State observation deck' },
        { tag: 'PACING', title: 'Day 2 ends past 9 PM with Rafa' },
      ].map((r,i) => (
        <div key={i} style={{ margin: '0 18px', padding: '8px 0', borderBottom: `1px solid ${t.hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A33A2E' }} />
          <div style={{ flex: 1, fontFamily: TYPE.serif, fontSize: 13, fontWeight: 600 }}>{r.title}</div>
          <Eyebrow color={t.inkFaint}>{r.tag}</Eyebrow>
        </div>
      ))}

      <div style={{ padding: '14px 18px 4px' }}>
        <Eyebrow color="#8A6F2D" style={{ fontWeight: 600 }}>QUIET NOTES · 2</Eyebrow>
      </div>
      {[
        { tag: 'LODGING', title: 'No lodging on Sun night — assuming you drive home' },
        { tag: 'RETURN', title: 'No return-travel stop after the arena' },
      ].map((r,i) => (
        <div key={i} style={{ margin: '0 18px', padding: '8px 0', borderBottom: `1px solid ${t.hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8A6F2D' }} />
          <div style={{ flex: 1, fontFamily: TYPE.serif, fontSize: 13, fontWeight: 500, color: t.inkMuted }}>{r.title}</div>
          <Eyebrow color={t.inkFaint}>{r.tag}</Eyebrow>
        </div>
      ))}

      <div style={{ padding: '14px 18px 4px' }}>
        <Eyebrow color="#2E5D3A" style={{ fontWeight: 600 }}>CLEARED · 9</Eyebrow>
      </div>
      <div style={{ padding: '4px 18px 24px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[
          'Hotel dates contiguous',
          'All venues open',
          'No back-to-back drives > 2h',
          'No outdoor activity on rain days',
          'Family meals every 4h',
          'Bathroom stops ≤ 90 min apart',
          'Hotel near anchor',
          'Reservation confirmations attached',
          'Profiles match (no allergy conflicts)',
        ].map((c, i) => (
          <span key={i} style={{
            padding: '3px 8px', borderRadius: 999, fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 1, color: '#2E5D3A',
            background: 'rgba(46,93,58,0.08)', textTransform: 'uppercase',
          }}>✓ {c}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3) SETTINGS · Helen
// ─────────────────────────────────────────────────────────────
function SettingsRow({ theme: t, label, value, sub, control, last }) {
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: last ? 'none' : `1px solid ${t.hairline}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: TYPE.sans, fontSize: 13, color: t.ink, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontFamily: TYPE.serif, fontSize: 11, fontStyle: 'italic', color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
      </div>
      {control || (value && <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 0.8 }}>{value}</span>)}
    </div>
  );
}
function Toggle({ on, theme: t }) {
  return (
    <div style={{
      width: 32, height: 18, borderRadius: 9, padding: 2,
      background: on ? t.accent : t.hairline, transition: 'all .2s',
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        marginLeft: on ? 14 : 0, transition: 'all .2s',
      }} />
    </div>
  );
}
function Segment({ items, active, theme: t }) {
  return (
    <div style={{ display: 'flex', background: t.surfaceAlt, borderRadius: 8, padding: 2 }}>
      {items.map(it => (
        <span key={it} style={{
          padding: '3px 8px', borderRadius: 6,
          background: active === it ? t.surface : 'transparent',
          fontFamily: TYPE.mono, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase',
          color: active === it ? t.ink : t.inkMuted, fontWeight: active === it ? 700 : 500,
          boxShadow: active === it ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        }}>{it}</span>
      ))}
    </div>
  );
}

function CL_SettingsHelen() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← SETTINGS</span>
        <Eyebrow color={t.inkMuted}>HELEN'S VIEW</Eyebrow>
        <span/>
      </div>
      <div style={{ padding: '4px 18px 12px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
          Claude in the app
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
          How the assistant behaves when you talk to it.
        </div>
      </div>

      <div style={{ margin: '0 18px', background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}` }}>
        <SettingsRow theme={t} label="Voice input" sub="Microphone everywhere it makes sense." control={<Toggle on theme={t} />} />
        <SettingsRow theme={t} label="Image upload" sub="Paste menus, screenshots, photos in chat." control={<Toggle on theme={t} />} />
        <SettingsRow theme={t} label='"Help me think" length' sub="When Claude is in guidance mode, how much it says." control={<Segment items={['concise','standard','detailed']} active="standard" theme={t} />} last />
      </div>

      <div style={{ padding: '14px 18px 8px' }}>
        <Eyebrow color={t.inkMuted}>NEW ITEMS</Eyebrow>
      </div>
      <div style={{ margin: '0 18px', background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}` }}>
        <SettingsRow theme={t} label="Default visibility" sub="Whether new stops you add are shared or hidden by default." control={<Segment items={['shared','hidden']} active="shared" theme={t} />} last />
      </div>

      <div style={{ padding: '14px 18px 8px' }}>
        <Eyebrow color={t.inkMuted}>FAMILY · READ-ONLY FOR YOU</Eyebrow>
      </div>
      <div style={{ margin: '0 18px 24px', background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}`, opacity: 0.55 }}>
        <SettingsRow theme={t} label="Monthly budget" sub="Set by Jonathan." value="—" />
        <SettingsRow theme={t} label="API key" sub="Configured by Jonathan." value="—" last />
      </div>
    </div>
  );
}

// 4) SETTINGS · Jonathan — gated additions
function CL_SettingsJonathan() {
  const t = TRAVELERS.jonathan.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto' }}>
      <div style={{ padding: '6px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← SETTINGS</span>
        <Eyebrow color={t.inkMuted}>JONATHAN'S VIEW · GATED</Eyebrow>
        <span/>
      </div>
      <div style={{ padding: '4px 18px 12px' }}>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
          Claude in the app
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 12.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
          Budget + key controls. Helen doesn't see this section.
        </div>
      </div>

      <div style={{ padding: '0 18px 8px' }}><Eyebrow color={t.inkMuted}>USAGE THIS MONTH</Eyebrow></div>
      <div style={{ margin: '0 18px 14px', padding: 14, background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontFamily: TYPE.serif, fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.5 }}>$23.40</span>
          <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted }}>of $60.00 cap</span>
        </div>
        <div style={{ height: 6, background: t.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: '39%', height: '100%', background: t.accent }} />
        </div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 0.8 }}>
          <span>$0</span>
          <span>SOFT $45 · 75%</span>
          <span>HARD $60</span>
        </div>
      </div>

      <div style={{ padding: '0 18px 8px' }}><Eyebrow color={t.inkMuted}>CAP &amp; THRESHOLDS</Eyebrow></div>
      <div style={{ margin: '0 18px', background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}` }}>
        <SettingsRow theme={t} label="Monthly cap" value="$60.00" />
        <SettingsRow theme={t} label="Soft threshold" sub="Notify when usage crosses this." value="75 %" />
        <SettingsRow theme={t} label="Hard threshold" sub="Hard cut Claude when usage hits this." value="100 %" />
        <SettingsRow theme={t} label="Notify by SMS" value="(617) ••• ••12" last />
      </div>

      <div style={{ padding: '14px 18px 8px' }}><Eyebrow color={t.inkMuted}>KEY</Eyebrow></div>
      <div style={{ margin: '0 18px 24px', background: t.surface, borderRadius: 12, border: `1px solid ${t.hairline}` }}>
        <SettingsRow theme={t} label="Anthropic API key" sub="Display only — configured via Worker secret." value="sk-ant-•••W3F" last />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5) EMPTY STATES — first conversation, no audits, no reveals
// ─────────────────────────────────────────────────────────────
function CL_EmptyFirstChat() {
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

      <div style={{ flex: 1, padding: '32px 22px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28, alignSelf: 'flex-start',
          background: 'rgba(46,93,58,0.08)', color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <ClaudeMark size={28} />
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.5 }}>
          Hi Helen.
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 16, fontStyle: 'italic', color: t.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
          I can plan a trip with you, modify one you've started, or hide a surprise from Jonathan until the moment lands.
        </div>

        <div style={{ marginTop: 22 }}>
          <Eyebrow color={t.inkMuted}>TRY ASKING</Eyebrow>
          <ChipRow theme={t} chips={[
            '"Add Sift Bake Shop to Sunday morning"',
            '"What would be fun for the kids on a rainy day in Asheville?"',
            '"Hide the Saturday balloon ride from Jonathan until we get there"',
            '"Stress-test this trip"',
          ]} />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          padding: '10px 12px', borderRadius: 10, background: t.surface, border: `1px solid ${t.hairline}`,
          fontFamily: TYPE.serif, fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.4, color: t.inkMuted,
        }}>
          Everything Claude proposes shows up as a <span style={{ color: t.accent, fontStyle: 'normal', fontFamily: TYPE.sans, fontWeight: 600, fontSize: 11 }}>draft</span> first. Nothing saves without you.
        </div>
      </div>

      <ChatComposer theme={t} placeholder="what would you like to do?" mode="guidance" />
    </div>
  );
}

function CL_EmptyNoAudits() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, padding: '24px 22px', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP</span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: 'rgba(46,93,58,0.08)', color: t.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <CheckIcon size={26} />
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.5 }}>
          Nothing to flag.
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontStyle: 'italic', color: t.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
          Hotels are contiguous. Drives stay inside Jonathan's rule. Everything's open on the day you go. I'll keep an eye on it as the dates get closer.
        </div>
        <div style={{ marginTop: 22, fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
          LAST RE-CHECKED 4 MIN AGO · NIGHTLY THEREAFTER
        </div>
        <button style={{
          marginTop: 18, padding: '8px 12px', borderRadius: 10, background: t.surface,
          border: `1px solid ${t.hairline}`, color: t.ink, cursor: 'pointer',
          fontFamily: TYPE.sans, fontSize: 12, fontWeight: 600,
        }}>Run stress-test anyway</button>
      </div>
    </div>
  );
}

function CL_EmptyNoReveals() {
  const t = TRAVELERS.helen.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, padding: '24px 22px', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted, letterSpacing: 1.2 }}>← TRIP SETTINGS</span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: 'rgba(122,62,145,0.10)', color: '#7A3E91',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <LockIcon size={24} />
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.5 }}>
          No surprises yet.
        </div>
        <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontStyle: 'italic', color: t.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
          When you hide a stop, day, or detail from someone, it'll show up here with the trigger that reveals it.
        </div>
        <button style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10, background: t.ink,
          color: t.bg, border: 'none', cursor: 'pointer',
          fontFamily: TYPE.sans, fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusIcon size={12} /> Plan a surprise
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6) ERROR STATES
// ─────────────────────────────────────────────────────────────
function CL_ErrorStates() {
  const t = TRAVELERS.helen.theme;

  const ErrCard = ({ icon, label, lead, body, action }) => (
    <div style={{
      padding: 12, background: t.surface, border: `1px solid ${t.hairline}`, borderRadius: 12, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Eyebrow color={t.inkMuted}>{label}</Eyebrow>
        {icon}
      </div>
      <div style={{ fontFamily: TYPE.serif, fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>
        {lead}
      </div>
      <div style={{ fontFamily: TYPE.serif, fontSize: 11.5, fontStyle: 'italic', color: t.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
        {body}
      </div>
      <div style={{ marginTop: 8 }}>
        {action}
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, overflow: 'auto', padding: '14px 18px' }}>
      <Eyebrow color={t.inkMuted}>ERROR STATES · NEVER TECHNICAL</Eyebrow>
      <div style={{ fontFamily: TYPE.serif, fontSize: 22, fontWeight: 700, marginTop: 6, letterSpacing: -0.4, lineHeight: 1.05 }}>
        When something goes wrong
      </div>
      <div style={{ fontFamily: TYPE.serif, fontSize: 12, fontStyle: 'italic', color: t.inkMuted, marginTop: 4, marginBottom: 14 }}>
        No error.toString. No stack traces. Helen-readable.
      </div>

      <ErrCard
        label="NETWORK DROPPED · QUEUED"
        icon={<span style={{ fontFamily: TYPE.mono, fontSize: 9, color: '#8A6F2D', letterSpacing: 1 }}>● HOLDING</span>}
        lead='"add sift bake shop sunday"'
        body="Your message is held. I'll send it the moment you're back online — no need to retype."
        action={<div style={{ fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>RETRY IN 12s · OR TAP TO SEND NOW</div>}
      />

      <ErrCard
        label="CLAUDE TIMED OUT"
        icon={<ClockIcon size={14} />}
        lead="Claude's taking a moment."
        body="Try again? I'll pick up where we left off."
        action={<button style={{ padding: '6px 12px', borderRadius: 16, border: `1px solid ${t.hairline}`, background: 'transparent', color: t.ink, fontFamily: TYPE.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Try again</button>}
      />

      <ErrCard
        label="SOMETHING WENT WRONG"
        icon={<AlertIcon size={14} />}
        lead="Something went wrong on my end."
        body="Try again, or rephrase what you were asking."
        action={<button style={{ padding: '6px 12px', borderRadius: 16, border: `1px solid ${t.hairline}`, background: 'transparent', color: t.ink, fontFamily: TYPE.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Try again</button>}
      />

      <ErrCard
        label="OUT OF BUDGET · BUDGET CAP HIT"
        icon={<span style={{ fontFamily: TYPE.mono, fontSize: 9, color: '#A33A2E', letterSpacing: 1 }}>● HARD CUT</span>}
        lead="I'm out of budget for the month."
        body="Send Jonathan a message and he can raise the limit."
        action={
          <button style={{
            padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#A33A2E', color: '#fff',
            fontFamily: TYPE.sans, fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Avatar id="jonathan" size={14} /> Text Jonathan
          </button>
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7) JONATHAN'S CHAT — dark editorial skin
// ─────────────────────────────────────────────────────────────
function CL_JonathanChat() {
  const t = TRAVELERS.jonathan.theme;
  return (
    <div style={{ height: '100%', background: t.bg, color: t.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.hairline }} />
      </div>
      <div style={{ padding: '8px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ClaudeLockup theme={t} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Eyebrow color={t.inkMuted}>ASHEVILLE</Eyebrow>
          <span style={{ color: t.inkMuted, marginLeft: 6 }}><XIcon size={12} /></span>
        </div>
      </div>
      <Hairline color={t.ink} style={{ margin: '0 18px' }} />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px 8px' }}>
        <UserBubble theme={t} who="jonathan">
          What's the drive look like Sunday?
        </UserBubble>

        <ClaudeBubble theme={t} mode="execute">
          About 4 hours, Asheville back to Boston via I-81. One built-in stop in Roanoke for lunch.
        </ClaudeBubble>

        <UserBubble theme={t} who="jonathan">
          Anything I should know?
        </UserBubble>

        <ClaudeBubble theme={t} mode="guidance">
          I'd ask Helen — she's been working on parts of this trip. From what's on your view, the drive is clean and your rule of 2:30 max isn't broken (longest single leg is 2:08).
        </ClaudeBubble>

        <div style={{ marginLeft: 38, marginTop: 4, fontFamily: TYPE.mono, fontSize: 9, color: t.inkFaint, letterSpacing: 1 }}>
          ANSWERS FROM HIS VIEW · NEVER REVEALS HIDDEN CONTENT
        </div>
      </div>

      <ChatComposer theme={t} placeholder="ask claude…" mode="execute" />
    </div>
  );
}

Object.assign(window, {
  CL_AuditReport, CL_StressTest,
  CL_SettingsHelen, CL_SettingsJonathan,
  CL_EmptyFirstChat, CL_EmptyNoAudits, CL_EmptyNoReveals,
  CL_ErrorStates, CL_JonathanChat,
});
