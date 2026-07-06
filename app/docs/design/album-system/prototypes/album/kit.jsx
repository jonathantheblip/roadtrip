// album/kit.jsx — the presentation chrome for the growing container. A neutral
// studio/editorial surface (NOT one of the four lenses) that frames the live
// prototypes and the rationale. Reusable across all three chapters.
// Depends on system.jsx (FONTS) + React.

const DOC = {
  bg: '#E7E3DA', panel: '#F5F2EB', panel2: '#FBF9F3', ink: '#201D19',
  muted: 'rgba(32,29,25,0.60)', faint: 'rgba(32,29,25,0.36)',
  line: 'rgba(32,29,25,0.12)', lineBold: 'rgba(32,29,25,0.22)',
  accent: '#BC5B38', accentSoft: '#EFE3D8', good: '#3E7D57',
};

function injectDocCSS() {
  if (document.getElementById('doc-css')) return;
  const s = document.createElement('style');
  s.id = 'doc-css';
  s.textContent = `
    .doc-main::-webkit-scrollbar{width:10px}
    .doc-main::-webkit-scrollbar-thumb{background:rgba(32,29,25,.18);border-radius:8px;border:3px solid ${DOC.bg}}
    .doc-main{scroll-behavior:smooth}
    .ft-scroll::-webkit-scrollbar{width:0;height:0}
    ::selection{background:${DOC.accent};color:#fff}
    .toc-a{transition:color .15s,border-color .15s}
    .lens-seg{transition:background .2s,color .2s}
    @keyframes rafapulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}
  `;
  document.head.appendChild(s);
}

// ── layout shell ─────────────────────────────────────────────────
function DocShell({ chapters, active, onChapter, toc, children }) {
  const mainRef = React.useRef(null);
  const [activeSec, setActiveSec] = React.useState(toc[0]?.id);
  React.useEffect(() => { injectDocCSS(); }, []);
  React.useEffect(() => {
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) setActiveSec(e.target.id); });
    }, { root: null, rootMargin: '-12% 0px -70% 0px', threshold: 0 });
    document.querySelectorAll('[data-doc-section]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [active, toc]);
  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
  };
  return (
    <div style={{ minHeight: '100vh', background: DOC.bg, color: DOC.ink, fontFamily: FONTS.inter }}>
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 264, zIndex: 20, borderRight: `1px solid ${DOC.line}`, background: DOC.panel, display: 'flex', flexDirection: 'column', padding: '26px 22px' }}>
        <div style={{ fontFamily: FONTS.fraunces, fontSize: 21, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.1 }}>The Album System</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: DOC.faint, marginTop: 7 }}>Family Trips · design memo</div>
        <div style={{ height: 1, background: DOC.line, margin: '20px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {chapters.map((c, i) => {
            const on = c.id === active;
            return (
              <button key={c.id} onClick={() => c.ready && onChapter(c.id)} disabled={!c.ready} style={{
                textAlign: 'left', border: 'none', cursor: c.ready ? 'pointer' : 'default', borderRadius: 9,
                background: on ? DOC.accent : 'transparent', color: on ? '#fff' : (c.ready ? DOC.ink : DOC.faint),
                padding: '9px 11px', display: 'flex', gap: 9, alignItems: 'baseline',
              }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, opacity: on ? 0.9 : 0.5, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1, display: 'block', lineHeight: 1.2 }}>{c.title}</span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', opacity: on ? 0.85 : 0.6 }}>{c.ready ? c.tag : 'next pass'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 1, background: DOC.line, margin: '20px 0 16px' }} />
        <div style={{ fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.4, textTransform: 'uppercase', color: DOC.faint, marginBottom: 10 }}>On this page</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }} className="ft-scroll">
          {toc.map(t => {
            const on = t.id === activeSec;
            return (
              <button key={t.id} className="toc-a" onClick={() => jump(t.id)} style={{
                textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '5px 0 5px 12px', borderLeft: `2px solid ${on ? DOC.accent : 'transparent'}`,
                color: on ? DOC.ink : DOC.muted, fontSize: 12, fontWeight: on ? 600 : 500, lineHeight: 1.3,
              }}>{t.label}</button>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 0.6, color: DOC.faint, lineHeight: 1.6 }}>
          Built on the real token spine.<br />Four lenses are the brand.
        </div>
      </aside>
      <main ref={mainRef} style={{ marginLeft: 264 }}>
        {children}
      </main>
    </div>
  );
}

// ── editorial primitives ─────────────────────────────────────────
function Wrap({ children, w = 940 }) {
  return <div style={{ maxWidth: w, margin: '0 auto', padding: '0 56px' }}>{children}</div>;
}
function Section({ id, kicker, title, sub, children }) {
  return (
    <section id={id} data-doc-section style={{ padding: '54px 0 8px', scrollMarginTop: 24 }}>
      <Wrap>
        {kicker && <div style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase', color: DOC.accent, marginBottom: 14 }}>{kicker}</div>}
        {title && <h2 style={{ fontFamily: FONTS.fraunces, fontSize: 34, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.08, margin: 0 }}>{title}</h2>}
        {sub && <p style={{ fontFamily: FONTS.fraunces, fontSize: 18, fontStyle: 'italic', color: DOC.muted, margin: '10px 0 0', maxWidth: 640, lineHeight: 1.4 }}>{sub}</p>}
        <div style={{ marginTop: title ? 26 : 0 }}>{children}</div>
      </Wrap>
    </section>
  );
}
function Lede({ children }) {
  return <p style={{ fontFamily: FONTS.fraunces, fontSize: 21, lineHeight: 1.5, color: DOC.ink, margin: '0 0 20px', maxWidth: 680, textWrap: 'pretty' }}>{children}</p>;
}
function P({ children, w = 660 }) {
  return <p style={{ fontFamily: FONTS.inter, fontSize: 15, lineHeight: 1.62, color: DOC.muted, margin: '0 0 15px', maxWidth: w, textWrap: 'pretty' }}>{children}</p>;
}
function Strong({ children }) { return <strong style={{ color: DOC.ink, fontWeight: 600 }}>{children}</strong>; }

// Question → decision block
function QA({ n, q, children, decision }) {
  return (
    <div style={{ borderTop: `1px solid ${DOC.line}`, padding: '26px 0', display: 'grid', gridTemplateColumns: '54px 1fr', gap: 24 }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: DOC.accent, paddingTop: 4 }}>Q{n}</div>
      <div>
        <h3 style={{ fontFamily: FONTS.fraunces, fontSize: 21, fontWeight: 600, letterSpacing: -0.3, margin: '0 0 12px', lineHeight: 1.2 }}>{q}</h3>
        {children}
        {decision && (
          <div style={{ marginTop: 14, background: DOC.panel, border: `1px solid ${DOC.line}`, borderLeft: `3px solid ${DOC.accent}`, borderRadius: 8, padding: '13px 16px' }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: DOC.accent }}>The call</span>
            <div style={{ fontFamily: FONTS.inter, fontSize: 14.5, lineHeight: 1.55, color: DOC.ink, marginTop: 6, fontWeight: 500, textWrap: 'pretty' }}>{decision}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── device stage ─────────────────────────────────────────────────
function LiveDevice({ lens, scale = 1, children }) {
  return (
    <div style={{ width: 375 * scale, height: 812 * scale, flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 375, height: 812 }}>
        <Phone traveler={lens}>{children}</Phone>
      </div>
    </div>
  );
}
// caption + optional recommended ribbon around any device
function Stage({ label, caption, rec, tone, children, flush }) {
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div style={{ position: 'relative', padding: flush ? 0 : 18, borderRadius: 30, background: rec ? DOC.panel2 : 'transparent', border: rec ? `1px solid ${DOC.accent}` : `1px solid transparent` }}>
        {rec && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: DOC.accent, color: '#fff', fontFamily: FONTS.mono, fontSize: 8.5, letterSpacing: 1.4, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', zIndex: 5 }}>Recommended</div>}
        {children}
      </div>
      {(label || caption) && (
        <figcaption style={{ marginTop: 14, textAlign: 'center', maxWidth: 300 }}>
          {label && <div style={{ fontFamily: FONTS.mono, fontSize: 9.5, letterSpacing: 1.4, textTransform: 'uppercase', color: tone === 'off' ? DOC.faint : DOC.accent }}>{label}</div>}
          {caption && <div style={{ fontFamily: FONTS.inter, fontSize: 12.5, color: DOC.muted, marginTop: 5, lineHeight: 1.45, textWrap: 'pretty' }}>{caption}</div>}
        </figcaption>
      )}
    </figure>
  );
}
// row of stages (forks / deltas), wraps and centers on a soft platform
function Exhibit({ children, bg = true, gap = 30 }) {
  return (
    <div style={{ background: bg ? DOC.panel : 'transparent', borderRadius: 22, border: bg ? `1px solid ${DOC.line}` : 'none', padding: bg ? '38px 30px 30px' : 0, margin: '8px 0 6px', display: 'flex', flexWrap: 'wrap', gap, justifyContent: 'center', alignItems: 'flex-start' }}>
      {children}
    </div>
  );
}
function Dot({ id, size = 9 }) {
  const t = TRAVELERS[id]; if (!t) return null;
  return <span style={{ width: size, height: size, borderRadius: '50%', background: t.dot, display: 'inline-block', flexShrink: 0 }} />;
}

Object.assign(window, { DOC, DocShell, Wrap, Section, Lede, P, Strong, QA, LiveDevice, Stage, Exhibit, Dot });
