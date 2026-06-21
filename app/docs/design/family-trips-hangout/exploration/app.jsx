// hangout/app.jsx — composes the exploration onto the design canvas.

const { DesignCanvas, DCSection, DCArtboard } = window;
const PH = 748; // phone artboard height
const PW = 342; // phone artboard width

// NOTE: these return DCArtboard ELEMENTS directly (called as functions, not
// rendered as <Component/>), because DesignCanvas matches children by
// `type === DCArtboard` — a wrapper component would be filtered out.
function phone(key, label, node, h = PH) {
  return <DCArtboard key={key} id={key} label={label} width={PW} height={h}
    style={{ borderRadius: 30, background: '#000', boxShadow: '0 1px 3px rgba(0,0,0,.16),0 10px 34px rgba(0,0,0,.16)' }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden' }}>{node}</div>
  </DCArtboard>;
}

function DirSection({ id, title, subtitle, thesis, dir, nowLenses, photoLens, lookLens }) {
  const H = window[`HG_${dir}_Home`], N = window[`HG_${dir}_Now`],
    P = window[`HG_${dir}_Photos`], L = window[`HG_${dir}_Look`];
  const T = window.HG_T;
  return <DCSection id={id} title={title} subtitle={subtitle}>
    <DCArtboard id={`${dir}-thesis`} label="the idea" width={384} height={PH}
      style={{ borderRadius: 16 }}>{thesis}</DCArtboard>
    {window.HG_ORDER.map((pid) => phone(`${dir}-home-${pid}`, `${T[pid].name} · home`, <H id={pid} />))}
    {nowLenses.map((pid) => phone(`${dir}-now-${pid}`, `Now rail · ${T[pid].name}`, <N id={pid} />))}
    {phone(`${dir}-photos-${photoLens}`, `Photos · ${T[photoLens].name}`, <P id={photoLens} />)}
    {phone(`${dir}-look-${lookLens}`, `Look-back · ${T[lookLens].name}`, <L id={lookLens} />)}
  </DCSection>;
}

const DT = window.HG_DirThesis;

function App() {
  return <DesignCanvas>
    <DCSection id="start" title="The default trip" subtitle="The do-nothing stay is the archetype — the app's first-class, most flexible experience. (Structured road trips are the rare exception.)">
      <DCArtboard id="reframe" label="the reframe" width={400} height={690} style={{ borderRadius: 16 }}>
        <window.HG_ConceptReframe /></DCArtboard>
      <DCArtboard id="minds" label="four minds" width={520} height={690} style={{ borderRadius: 16 }}>
        <window.HG_ConceptMinds /></DCArtboard>
      <DCArtboard id="trips" label="every trip" width={460} height={690} style={{ borderRadius: 16 }}>
        <window.HG_ConceptTrips /></DCArtboard>
      <DCArtboard id="surfaces" label="how to read this" width={420} height={690} style={{ borderRadius: 16 }}>
        <window.HG_ConceptSurfaces /></DCArtboard>
    </DCSection>

    <DirSection id="dirA" dir="A" title="A · By the Light" nowLenses={['jonathan', 'aurelia']} photoLens="aurelia" lookLens="helen"
      subtitle="Place-led. The cottage, the tide and the light lead — the day already has a shape."
      thesis={<DT letter="A" name="By the Light" tint="#E2A04A"
        tagline="The place keeps time, not a plan."
        idea="The cottage, the tide and the light lead every screen. Nothing is scheduled because the day already has a shape — the sun gives it one."
        lead="A live view of where you are plus today's conditions — air, water, tide, sunset. One idea surfaces from whatever the shore is offering this hour."
        rail="A sun-and-tide strip. The day told in light — golden hour, low tide, sunset — never a '2:00 event.'"
        photos="File to the place and the arc of the day's light: sunrise to dusk, no events needed."
        look="'A day at the house' — one view across the hours, with what happened there." />} />

    <DirSection id="dirB" dir="B" title="B · As It Happens" nowLenses={['helen', 'rafa']} photoLens="jonathan" lookLens="aurelia"
      subtitle="Feed-led. A living stream of small moments and who's around carries the screen."
      thesis={<DT letter="B" name="As It Happens" tint="#5AA6C8"
        tagline="The family is the feed."
        idea="A living stream of small moments leads. Who's around and what just landed carries the screen. Ideas weave in only when the feed goes quiet."
        lead="A presence header — who's where — over the latest moments. A suggestion appears woven into a lull, never as a schedule."
        rail="A presence rail: four people, live status, tap to see what they're up to, 'ping all' to gather."
        photos="The feed IS the photos — one ambient stream, grouped by half-day, tagged by who's in the frame."
        look="The day's moments braided into one Weave page: four contributions, no stops." />} />

    <DirSection id="dirC" dir="C" title="C · We Could…" nowLenses={['helen', 'rafa']} photoLens="aurelia" lookLens="jonathan"
      subtitle="Pantry-led. A tray of pre-scoped, family-tagged ideas, dealt the moment someone asks. (Closest to your stated need.)"
      thesis={<DT letter="C" name="We Could…" tint="#E07A5A"
        tagline="A tray of ready ideas, dealt on demand."
        idea="The home is a curated deck of pre-scoped, family-tagged possibilities — meals, energy for Rafa, pretty things for Aurelia. Tapping a card says 'let's go'; it never books anything."
        lead="The pantry itself: photo cards with a blurb, who it's ideal for, and when it's good. Filter by a bite / burn energy / for Aurelia / all of us."
        rail="A soft 'want to…?' nudge — one or two well-timed cards ('Rafa's been inside 2 hrs…'), quiet by default."
        photos="Flow ambiently; the ones that came from a pick quietly remember where you went."
        look="'What we ended up doing' — the handful of cards you actually reached for, in order." />} />

    <DCSection id="decide" title="Deciding together"
      subtitle="Open time only — a meal, an hour to kill, somewhere to land. Location + time surface it; anyone (even Aurelia) proposes; Helen and Jonathan call it. Booked plans and surprises never enter the vote.">
      <DCArtboard id="decide-legend" label="the mechanic" width={384} height={PH} style={{ borderRadius: 16 }}>
        <window.HG_P_Legend /></DCArtboard>
      {phone('decide-meal-jonathan', 'What now? · Jonathan', <window.HG_P_Surface id="jonathan" />)}
      {phone('decide-propose-aurelia', 'Propose · Aurelia', <window.HG_P_Propose id="aurelia" />)}
      {phone('decide-incoming-helen', 'Decide · Helen', <window.HG_P_Incoming id="helen" />)}
      {phone('decide-incoming-jonathan', 'Decide · Jonathan', <window.HG_P_Incoming id="jonathan" />)}
    </DCSection>
  </DesignCanvas>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
