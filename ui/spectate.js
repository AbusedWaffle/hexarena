// Tilskuer-bjælke: lytter på 'hexarena:spectate' {id, cls, name, count} fra render/game.js (id:null = ser ikke med).
// Viser 'SER: <navn> · <klasse>' øverst i midten under ur/score og lobby-chip; ved count>1 skifter et tryk hvor som helst
// (ikke på knapper/lobby) til næste holdkammerat via 'hexarena:spectate-next' (max hver 250 ms).
const CSS = `
.hs-bar{position:fixed;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + clamp(42px,12vh,64px));transform:translateX(-50%);z-index:35;pointer-events:none;
 display:flex;gap:10px;align-items:baseline;white-space:nowrap;font:600 clamp(11px,3.4vh,15px) var(--ha-font,'Roboto Mono',monospace);letter-spacing:.12em;color:#E6ECFF;
 padding:4px 12px;background:linear-gradient(90deg,rgba(11,16,48,.25),rgba(11,16,48,.85),rgba(11,16,48,.25));border-left:3px solid #4FA3FF}
.hs-bar[hidden]{display:none}.hs-bar b{color:#FFE9A8}.hs-bar .hint{font-size:.8em;opacity:.65;letter-spacing:.08em;font-weight:400}
`;
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const st = el('style'); st.textContent = CSS; document.head.append(st);
const bar = el('div', 'hs-bar'); bar.id = 'spectate-bar'; bar.hidden = true;
let cur = null, last = 0;

function show(d) {
  cur = d && d.id != null ? d : null;
  if (!bar.isConnected) (document.body || document.documentElement).append(bar);
  bar.hidden = !cur; if (!cur) return;
  const name = cur.name && cur.name !== cur.cls ? cur.name : 'Holdkammerat';
  bar.replaceChildren();
  const who = el('span'); who.append('SER: '); const b = el('b'); b.textContent = name; who.append(b, ' · ' + (cur.cls || ''));
  bar.append(who);
  if (cur.count > 1) { const h = el('span', 'hint'); h.textContent = 'Tryk for at skifte'; bar.append(h); }
}
addEventListener('hexarena:spectate', (e) => show(e.detail));
addEventListener('pointerdown', (e) => {
  if (!cur || !(cur.count > 1)) return;
  const t = e.target;
  if (t.closest?.('button, a, input, select, #lobby, #lobby-chip, .hm-over, .hm-ingame')) return;
  const now = performance.now(); if (now - last < 250) return; last = now;
  dispatchEvent(new CustomEvent('hexarena:spectate-next'));
}, true);
if (globalThis.__spectate) show(globalThis.__spectate);
