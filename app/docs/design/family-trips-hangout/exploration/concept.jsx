// hangout/concept.jsx — the felt-experience + strategy panels (neutral skin).

const CP = window.HG_PAPER;

function Panel({ children, pad = 30 }) {
  return <div style={{ width: '100%', height: '100%', background: CP.bg, color: CP.ink,
    fontFamily: CP.body, padding: pad, boxSizing: 'border-box', overflow: 'hidden',
    display: 'flex', flexDirection: 'column' }}>{children}</div>;
}
function K({ children, c = CP.accent }) {
  return <div style={{ fontFamily: CP.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase',
    fontWeight: 600, color: c, marginBottom: 16 }}>{children}</div>;
}

// 1 ─ The reframe
function ConceptReframe() {
  return <Panel>
    <K>The default trip · the reframe</K>
    <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 38, lineHeight: 1.0, letterSpacing: -1 }}>
      We&rsquo;re just here.</div>
    <div style={{ fontSize: 15, lineHeight: 1.5, color: CP.muted, marginTop: 16, textWrap: 'pretty' }}>
      A stay, not a route — a cottage with nothing booked. And this isn&rsquo;t the exotic exception to a road
      trip: <span style={{ color: CP.ink }}>it&rsquo;s the trip.</span> The do-nothing stay is what most of our travel
      actually is; the timed, structured trip is the rare one. So flexibility isn&rsquo;t a mode you switch on —
      <span style={{ color: CP.ink }}> it&rsquo;s the shape every trip starts in.</span></div>
    <div style={{ height: 1, background: CP.line, margin: '22px 0' }} />
    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: CP.ink, textWrap: 'pretty' }}>
      What we <em>do</em> need is help <span style={{ color: CP.accent, fontWeight: 600 }}>deciding</span> —
      where to snag a meal, something spontaneous, somewhere to burn Rafa&rsquo;s energy, something shareable
      for Aurelia. None of it will ever be scheduled. All of it should already be
      <span style={{ color: CP.ink, fontWeight: 600 }}> scoped and waiting</span> in the app: a photo, a
      blurb, and who it&rsquo;s ideal for — ready the second someone asks &ldquo;what should we do?&rdquo;</div>
    <div style={{ flex: 1 }} />
    <div style={{ display: 'flex', gap: 18, marginTop: 20 }}>
      <div style={{ flex: 1 }}>
        <K c={CP.faint}>What leaves</K>
        {['THE PLAN (timed events)', 'The drive ticker', 'Next-event clock rail', 'Photos filed to events'].map((x) =>
          <div key={x} style={{ fontSize: 12, color: CP.muted, padding: '4px 0', textDecoration: 'line-through',
            textDecorationColor: CP.faint }}>{x}</div>)}
      </div>
      <div style={{ flex: 1 }}>
        <K c={CP.accent}>What leads</K>
        {['Where we are + the light', 'Small moments as they land', 'A pantry of ready ideas', 'A day, woven from being-there'].map((x) =>
          <div key={x} style={{ fontSize: 12, color: CP.ink, padding: '4px 0' }}>{x}</div>)}
      </div>
    </div>
  </Panel>;
}

// 2 ─ Four minds on a do-nothing weekend
function ConceptMinds() {
  const rows = [
    { id: 'jonathan', verb: 'He runs point — and gets to notice',
      body: 'Logistics are his reflex: the tide chart, where the oysters are, the drive times. But the empty days are exactly when he sets the clipboard down and catches the small stuff — the light on the water, Gary the crab, who needs feeding before a meltdown.' },
    { id: 'helen', verb: 'She keeps, and she provisions',
      body: 'Not only the soft keeper of moments. She&rsquo;ll scope the bakery, book the table, and know which beach works at low tide. Remembering and arranging are the same muscle for her.' },
    { id: 'aurelia', verb: 'Her eye is trained by the feed',
      body: 'Thirteen. Her sense of &ldquo;pretty&rdquo; is shaped by what plays online — what&rsquo;s postable, what&rsquo;s current, what friends would react to. Less fine-art photographer, more of-the-moment: surface the shareable, not just the scenic.' },
    { id: 'rafa', verb: 'He never had a schedule anyway',
      body: 'Five, no plan to break. He needs the next place to put his body and someone to point him at it — then a way to tell the story of the crab afterward, loudly.' },
  ];
  return <Panel>
    <K>The hangout trip · four minds</K>
    <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 27, lineHeight: 1.05, letterSpacing: -0.6, marginBottom: 4 }}>
      One do-nothing weekend,<br/>experienced four ways.</div>
    <div style={{ fontSize: 12.5, color: CP.muted, marginTop: 7, lineHeight: 1.4 }}>
      Each has a default verb — but a trip off-plan blurs them. Nobody is only their lane.</div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', marginTop: 10 }}>
      {rows.map((r) => {
        const tt = window.HG_T[r.id];
        return <div key={r.id} style={{ display: 'flex', gap: 14, padding: '11px 0', borderTop: `1px solid ${CP.line}` }}>
          <div style={{ flexShrink: 0, width: 46 }}>
            <div style={{ width: 30, height: 30, borderRadius: 30, background: tt.dot, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{tt.initial}</div>
            <div style={{ fontFamily: CP.mono, fontSize: 8, letterSpacing: 0.5, color: CP.faint, marginTop: 6,
              textTransform: 'uppercase' }}>{tt.name}<br/>{tt.verb}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 17, letterSpacing: -0.3,
              color: CP.ink, lineHeight: 1.1 }} dangerouslySetInnerHTML={{ __html: r.verb }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: CP.muted, marginTop: 5, textWrap: 'pretty' }}
              dangerouslySetInnerHTML={{ __html: r.body }} />
          </div>
        </div>;
      })}
    </div>
  </Panel>;
}

// 3 ─ Surface map + how to read the directions
function ConceptSurfaces() {
  const rows = [
    { s: 'a · Home', was: 'led with THE PLAN', now: 'leads with place + a ready pantry of ideas' },
    { s: 'b · "Now" rail', was: 'clock-picked the next event', now: 'becomes conditions, presence, or a soft nudge' },
    { s: 'c · Photos', was: 'filed to events', now: 'flow as an ambient stream of being-there' },
    { s: 'd · Look-back', was: 'replayed the schedule', now: 'weaves the day from moments, not stops' },
  ];
  return <Panel>
    <K>How to read this board</K>
    <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 25, lineHeight: 1.05, letterSpacing: -0.5 }}>
      Four surfaces,<br/>three directions.</div>
    <div style={{ fontSize: 13, lineHeight: 1.5, color: CP.muted, marginTop: 12, textWrap: 'pretty' }}>
      Each surface below is shown with an <span style={{ color: CP.ink }}>empty schedule</span> — no broken
      &ldquo;THE PLAN.&rdquo; The home view is rendered in all four lenses; the now-rail, photos and look-back
      are shown in the lens that carries them best, with notes on the rest.</div>
    <div style={{ marginTop: 20 }}>
      {rows.map((r) => <div key={r.s} style={{ padding: '12px 0', borderTop: `1px solid ${CP.line}` }}>
        <div style={{ fontFamily: CP.mono, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase',
          fontWeight: 600, color: CP.accent }}>{r.s}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 5 }}>
          <span style={{ fontSize: 12, color: CP.faint, textDecoration: 'line-through' }}>{r.was}</span>
          <span style={{ color: CP.faint }}>→</span>
          <span style={{ fontSize: 12.5, color: CP.ink }}>{r.now}</span>
        </div>
      </div>)}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
      {[['A', 'By the Light', 'place-led'], ['B', 'As It Happens', 'feed-led'], ['C', 'We Could…', 'pantry-led']].map(([l, n, d]) =>
        <div key={l} style={{ flex: 1, background: CP.bg2, borderRadius: 10, padding: '11px 12px', border: `1px solid ${CP.line}` }}>
          <div style={{ fontFamily: CP.mono, fontSize: 13, fontWeight: 700, color: CP.accent }}>{l}</div>
          <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 14, marginTop: 3, letterSpacing: -0.2 }}>{n}</div>
          <div style={{ fontSize: 10, color: CP.muted, marginTop: 2 }}>{d}</div>
        </div>)}
    </div>
  </Panel>;
}

// 4 ─ The flexible model spans every trip, past and future
function ConceptTrips() {
  const Meter = ({ fixed }) => <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
    {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 5, height: 5, borderRadius: 5,
      background: i < fixed ? CP.accent : 'transparent', border: `1px solid ${i < fixed ? CP.accent : CP.faint}` }} />)}
  </span>;
  const Trip = ({ name, when, fixed, tag, here }) => <div style={{ display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 0', borderTop: `1px solid ${CP.line}` }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 15, color: CP.ink, letterSpacing: -0.2 }}
        dangerouslySetInnerHTML={{ __html: name }} />
      <div style={{ fontSize: 11, color: CP.faint, marginTop: 2 }}>{when}{here ? ' · we\u2019re here' : ''}</div>
    </div>
    <Meter fixed={fixed} />
    <span style={{ width: 96, textAlign: 'right', fontFamily: CP.mono, fontSize: 8.5, letterSpacing: 0.5,
      textTransform: 'uppercase', fontWeight: 600, color: fixed ? CP.accent : CP.muted }}>{tag}</span>
  </div>;
  return <Panel>
    <K>Every trip · by default</K>
    <div style={{ fontFamily: CP.display, fontWeight: 600, fontSize: 26, lineHeight: 1.05, letterSpacing: -0.6 }}>
      Open is the default.<br/>Structure is the add-on.</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: CP.muted, marginTop: 11, textWrap: 'pretty' }}>
      Every trip opens flexible. You pin fixed points only on the rare one that needs them — and that same
      flexibility runs backward into the look-back and forward into the next.</div>
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: CP.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: CP.faint, marginBottom: 2 }}>Behind us</div>
      <Trip name="The cottage on Indian Neck" when="Wellfleet · this week" fixed={0} tag="all open" here />
      <Trip name="Grandma&rsquo;s, for no reason" when="last March" fixed={0} tag="all open" />
      <Trip name="Rafa&rsquo;s 5th · NYC" when="last May" fixed={3} tag="3 fixed" />
    </div>
    <div style={{ marginTop: 14 }}>
      <div style={{ fontFamily: CP.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: CP.faint, marginBottom: 2 }}>Ahead</div>
      <Trip name="Labor Day at the lake" when="this Sept" fixed={0} tag="all open" />
      <Trip name="Aurelia&rsquo;s tournament" when="this Oct" fixed={2} tag="games fixed" />
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ fontSize: 12, color: CP.muted, fontStyle: 'italic', lineHeight: 1.5 }}>
      The road trip is the outlier — three pins on an otherwise open week. Flexibility is the container; structure is what you add to it.</div>
  </Panel>;
}

Object.assign(window, { HG_ConceptReframe: ConceptReframe, HG_ConceptMinds: ConceptMinds, HG_ConceptSurfaces: ConceptSurfaces, HG_ConceptTrips: ConceptTrips });
