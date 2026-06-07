// rafaGames.js — Rafa's games: the registry of real games + the AI maker glue.
// Real games are self-contained HTML under public/games/ (canvas, no deps, no
// localStorage/parent access → safe in a strict origin-isolated iframe). The
// maker asks the worker (Claude) for a new self-contained game and always has a
// canned fallback so "make a game" never fails. Voice goes through the worker's
// Whisper endpoint. iPad only (RafaPad).

import { workerFetch, isWorkerConfigured } from './workerSync'

// ── REGISTRY ── Rafa's three real games (he built them). Static files in
// public/games/<id>.html. Titles/emoji are kid-facing.
export const RAFA_GAMES = [
  { id: 'gorillas', title: 'Banana Toss', emoji: '🦍', tint: '#4CC36E' },
  { id: 'math', title: 'Monster Truck Math', emoji: '🚛', tint: '#3DA5E0' },
  { id: 'catch', title: 'Catch & Grow', emoji: '⭐', tint: '#C77DFF' },
]

// base-aware src so the iframe resolves under '/' AND '/roadtrip/'.
export function gameSrc(id) {
  return `${import.meta.env.BASE_URL}games/${id}.html`
}

// AI-made games persist on the device (no cross-device sync in v1).
const MADE_KEY = 'rt_rafa_games_v1'
export function loadMadeGames() {
  try {
    return JSON.parse(localStorage.getItem(MADE_KEY) || '[]')
  } catch {
    return []
  }
}
export function saveMadeGames(list) {
  try {
    localStorage.setItem(MADE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function stripFences(s) {
  return s
    .replace(/^```html?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

// Ask the worker (Claude) to write a self-contained HTML game. `modify` carries
// the current game's HTML for a "Change it" remix. Falls back to a canned game
// on ANY failure (worker not configured / down / offline) so the flow always
// completes. workerFetch throws on non-ok, so any throw → canned.
export async function generateGame(desc, modify) {
  if (isWorkerConfigured()) {
    try {
      const r = await workerFetch('/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desc, modify: modify || null }),
      })
      const data = await r.json()
      const html = typeof data?.html === 'string' ? data.html : ''
      if (html && /</.test(html)) return stripFences(html)
    } catch {
      /* fall through to canned */
    }
  }
  return cannedGame(desc)
}

// Transcribe Rafa's recorded voice via the worker's Whisper endpoint. Returns
// the text, or null on any failure (caller then falls back to typed/canned).
export async function transcribeAudio(blob) {
  if (!isWorkerConfigured() || !blob) return null
  try {
    const r = await workerFetch('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    })
    const data = await r.json()
    const text = typeof data?.text === 'string' ? data.text.trim() : ''
    return text || null
  } catch {
    return null
  }
}

// A real, self-contained catch-the-falling-dots game — the guaranteed fallback
// when Claude can't be reached, so "make a game" always ends in something fun.
export function cannedGame() {
  return `<!DOCTYPE html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#1B1108;font-family:Fredoka,system-ui,sans-serif;touch-action:none}#c{display:block}</style></head><body><canvas id=c></canvas><script>
var cv=document.getElementById('c'),x=cv.getContext('2d');function R(){cv.width=innerWidth;cv.height=innerHeight}R();onresize=R;
var cols=['#FFB12E','#3DA5E0','#4CC36E','#FF6B4D','#C77DFF'],drops=[],px=innerWidth/2,score=0,ci=0;
function add(){drops.push({x:Math.random()*innerWidth,y:-30,v:1+Math.random()*1.5,c:cols[Math.random()*cols.length|0]})}
setInterval(add,700);
addEventListener('pointermove',function(e){px=e.clientX});addEventListener('pointerdown',function(e){px=e.clientX});
function loop(){x.fillStyle='#1B1108';x.fillRect(0,0,cv.width,cv.height);
for(var i=drops.length-1;i>=0;i--){var d=drops[i];d.y+=d.v*2;x.fillStyle=d.c;x.beginPath();x.arc(d.x,d.y,18,0,7);x.fill();
if(d.y>cv.height-70&&Math.abs(d.x-px)<60){score++;ci=cols.indexOf(d.c);drops.splice(i,1)}else if(d.y>cv.height+30){drops.splice(i,1)}}
var r=34+score*1.5;x.fillStyle=cols[ci];x.beginPath();x.arc(px,cv.height-44,r,0,7);x.fill();
x.fillStyle='#FFF3DF';x.font='bold 40px Fredoka,sans-serif';x.fillText(score,24,56);requestAnimationFrame(loop)}loop();
<\/script></body></html>`
}
