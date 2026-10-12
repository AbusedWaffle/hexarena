// Lobby-overlay for host i Modern Warfare 2-pregame-layout (HexArena-stil): menu + kort/kode/QR til venstre,
// holdliste som scoreboard til højre, ticker i bunden.
// Lytter på 'hexarena:lobby' fra render/game.js: detail = {code, status?, error?, roster?}; roster = [{id, team, cls, human, name}].
import qrcode from '../vendor/qrcode.mjs';

const CSS = `
.hl-wrap{position:fixed;inset:0;z-index:50;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-rows:minmax(0,1fr) auto;gap:0 3vw;
 background:linear-gradient(90deg,rgba(6,9,26,.94),rgba(11,16,48,.86));font-family:var(--ha-font,'Roboto Mono',monospace);color:var(--ha-text,#E6ECFF);
 padding:max(10px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden}
.hl-wrap[hidden]{display:none}
.hl-l,.hl-r{display:flex;flex-direction:column;min-height:0;min-width:0;gap:clamp(4px,1.4vh,10px)}
.hl-title{font-size:clamp(18px,5.5vh,34px);font-weight:700;letter-spacing:.3em;line-height:1.1}
.hl-sub{font-size:clamp(10px,2.6vh,13px);opacity:.6;letter-spacing:.15em;text-transform:uppercase}
.hl-menu{display:flex;flex-direction:column}
.hl-mi{all:unset;cursor:pointer;font-size:clamp(13px,4vh,20px);letter-spacing:.12em;padding:clamp(2px,.9vh,6px) 12px;border-left:3px solid transparent;opacity:.75}
.hl-mi:hover,.hl-mi.sel{opacity:1;background:linear-gradient(90deg,rgba(79,163,255,.35),rgba(79,163,255,0));border-left-color:#4FA3FF}
.hl-mi.ha-btn{min-height:0;min-width:0;border-radius:0;box-shadow:none;border:0;border-left:3px solid transparent;background:none;text-align:left;justify-content:flex-start}
.hl-mi.ha-btn.sel,.hl-mi.ha-btn:hover{border-left-color:#4FA3FF;background:linear-gradient(90deg,rgba(79,163,255,.4),rgba(79,163,255,0))}
.hl-card{display:flex;gap:10px;align-items:stretch;min-height:0;flex:1;max-height:230px}
.hl-map{position:relative;flex:1;min-width:0;border:1px solid var(--ha-edge,#22305A);background:#0B1030;overflow:hidden}
.hl-map canvas{width:100%;height:100%;object-fit:contain;display:block;image-rendering:pixelated}
.hl-mapname{position:absolute;right:6px;bottom:4px;font-size:11px;letter-spacing:.15em;opacity:.8;text-transform:uppercase}
.hl-mapcode{position:absolute;left:6px;top:4px;font-size:11px;letter-spacing:.12em;background:rgba(6,9,26,.7);padding:1px 5px}
.hl-codebox{display:flex;flex-direction:column;align-items:center;gap:4px;flex:none}
.hl-qr{background:#fff;padding:4px;height:clamp(60px,26vh,150px);aspect-ratio:1;box-sizing:border-box}
.hl-qr svg{width:100%;height:100%;display:block}
.hl-code{font-size:clamp(20px,7.5vh,40px);font-weight:700;letter-spacing:.14em;line-height:1;user-select:all}
.hl-status{font-size:11px;opacity:.7;min-height:1.2em}.hl-status.err{color:#FF6B6B;opacity:1}
.hl-head{display:flex;justify-content:space-between;align-items:baseline;font-size:clamp(12px,3.6vh,18px);letter-spacing:.12em;border-bottom:1px solid var(--ha-edge,#22305A);padding-bottom:4px}
.hl-roster{display:flex;flex-direction:column;gap:2px;overflow:auto;min-height:0}
.hl-p{display:flex;align-items:center;gap:8px;height:clamp(18px,5.6vh,30px);flex:none;padding:0 8px;font-size:clamp(11px,3.2vh,15px);background:rgba(34,48,90,.45);border-left:4px solid}
.hl-p.blue{border-color:#4FA3FF}.hl-p.red{border-color:#FF5A5A}
.hl-p.bot{opacity:.55}
.hl-p.human{background:linear-gradient(90deg,rgba(255,215,90,.32),rgba(255,215,90,.08));color:#FFE9A8}
.hl-p img{height:75%;aspect-ratio:1}
.hl-p .t{margin-left:auto;font-size:.8em;opacity:.7;letter-spacing:.1em}
.hl-gap{height:4px;flex:none}
.hl-count{margin-top:auto;align-self:flex-end;font-size:clamp(18px,7vh,40px);font-weight:700;letter-spacing:.08em;opacity:.25;line-height:1;padding-bottom:4px}
.hl-tick{grid-column:1/-1;margin:0 calc(-1*max(16px,env(safe-area-inset-left)));padding:5px 16px max(5px,env(safe-area-inset-bottom));background:rgba(79,163,255,.14);border-top:1px solid rgba(79,163,255,.4);font-size:clamp(10px,3vh,13px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hl-card{max-height:none}
.hl-modal{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:rgba(6,9,26,.7)}
.hl-mbox{display:flex;gap:clamp(12px,3vw,28px);align-items:center;padding:clamp(10px,3vh,22px) clamp(14px,3vw,28px);background:var(--ha-panel,#0B1030);border:1px solid var(--ha-edge,#22305A);border-left:4px solid #4FA3FF;max-height:calc(100% - 16px);box-sizing:border-box}
.hl-mbox .hl-qr{height:clamp(120px,62vh,300px)}
.hl-mcol{display:flex;flex-direction:column;gap:clamp(6px,2vh,12px)}
.hl-mbox .hl-code{font-size:clamp(36px,13vh,72px)}
.hl-mbox .ha-btn{min-height:40px}
.hl-chip{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:40;font:600 13px 'Roboto Mono',monospace;padding:6px 10px;border-radius:8px;background:rgba(6,9,26,.8);color:#E6ECFF;border:1px solid #4FA3FF;cursor:pointer}
`;

const MODES = { tdm: 'HOLDKAMP', team: 'HOLDKAMP', knockout: 'KNOCKOUT', ffa: 'ALLE MOD ALLE' };
const qs = new URLSearchParams(location.search);
const title = MODES[(qs.get('mode') || '').toLowerCase()] || 'HOLDKAMP';
const ICONS = ['assault', 'sniper', 'engineer', 'scout', 'support'];

let started = false, showCode = false, code = null, roster = [], status = 'connecting', error = '', open = true, map = null;
fetch(new URL('../data/map_paintyard_sq_01.json', import.meta.url)).then(r => r.json()).then(m => { map = m; render(); }).catch(() => {});
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const st = el('style'); st.textContent = CSS; document.head.append(st);
const wrap = el('div', 'hl-wrap'); wrap.id = 'lobby';
const chip = el('button', 'hl-chip'); chip.id = 'lobby-chip'; chip.hidden = true;
chip.onclick = () => { open = true; render(); };
const link = () => location.origin + location.pathname + '?room=' + code;

function drawMap() {
  const c = el('canvas'); if (!map) return c;
  const s = 8, rows = map.rows; c.width = map.width * s; c.height = map.height * s;
  const g = c.getContext('2d'); g.fillStyle = '#121a44'; g.fillRect(0, 0, c.width, c.height);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = ch === '#' ? '#3a4a80' : ch === 'x' ? '#8a6a3a' : ch === 'B' ? 'rgba(79,163,255,.6)' : ch === 'R' ? 'rgba(255,90,90,.6)' : null;
    if (col) { g.fillStyle = col; g.fillRect(x * s, y * s, s - (ch === '#' ? 0 : 1), s - (ch === '#' ? 0 : 1)); }
  }));
  return c;
}

function rowEl(r) {
  const d = el('div', 'hl-p ' + r.team + (r.human ? ' human' : ' bot'));
  const k = String(r.cls || '').toLowerCase();
  const img = el('img'); img.alt = ''; img.src = new URL(`../art/icons/${ICONS.includes(k) ? k : 'assault'}_${r.team === 'red' ? 'red' : 'blue'}.svg`, import.meta.url).href;
  const name = r.human ? (r.id === 'me' ? 'Dig' : (r.name || 'Spiller')) : 'Robot · ' + (r.cls || '');
  d.append(img, el('span', '', name), el('span', 't', r.team === 'red' ? 'RØD' : 'BLÅ'));
  return d;
}

function render() {
  if (!code) return;
  if (!wrap.isConnected) document.body.append(wrap, chip);
  wrap.hidden = !open; chip.hidden = open; chip.textContent = 'Kode ' + code;
  if (!open) return;
  wrap.replaceChildren();
  const L = el('div', 'hl-l'), R = el('div', 'hl-r');
  const menu = el('div', 'hl-menu');
  const start = el('button', 'hl-mi sel ha-btn primary', started ? 'TILBAGE TIL KAMPEN' : 'START KAMPEN'); start.id = 'lobby-start';
  start.onclick = () => {
    open = false; showCode = false;
    // første tryk starter kampen: game.js holder simulering/rundeur stille indtil dette event (sendes kun én gang)
    if (!started) { started = true; globalThis.__lobbyStarted = true; globalThis.dispatchEvent(new CustomEvent('hexarena:lobby-start', { detail: { code } })); }
    render();
  };
  const mkShare = (cls) => { const b = el('button', cls, navigator.share ? 'DEL LINK' : 'KOPIÉR LINK');
    b.onclick = async () => {
      try { if (navigator.share) await navigator.share({ title: 'HexArena', text: 'Spil med! Kode ' + code, url: link() }); else { await navigator.clipboard.writeText(link()); b.textContent = 'KOPIERET ✓'; } }
      catch { try { await navigator.clipboard.writeText(link()); b.textContent = 'KOPIERET ✓'; } catch {} }
    }; return b; };
  const share = mkShare('hl-mi ha-btn'); share.id = 'lobby-share';
  const show = el('button', 'hl-mi ha-btn', 'VIS KODE'); show.id = 'lobby-show-code';
  show.onclick = () => { showCode = true; render(); };
  const back = el('button', 'hl-mi ha-btn', 'MENU'); back.onclick = () => { location.href = location.pathname; };
  for (const b of [start, show, share, back]) b.onmouseenter = () => menu.querySelectorAll('.hl-mi').forEach(x => x.classList.toggle('sel', x === b));
  menu.append(start, show, share, back);

  const card = el('div', 'hl-card');
  const mp = el('div', 'hl-map'); mp.append(drawMap(), el('div', 'hl-mapcode', 'KODE ' + code), el('div', 'hl-mapname', map?.name || 'Paintyard'));
  const q = qrcode(0, 'M'); q.addData(link()); q.make();
  const qr = el('div', 'hl-qr'); qr.id = 'lobby-qr'; qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  const codeEl = el('div', 'hl-code', code); codeEl.id = 'lobby-code';
  card.append(mp);
  const s = el('div', 'hl-status' + (status === 'error' ? ' err' : ''),
    status === 'error' ? 'Netværksfejl: ' + error : status === 'open' ? 'Klar – venner kan nu deltage med koden' : 'Opretter spil…');
  s.id = 'lobby-status';
  L.append(el('div', 'hl-title', title), menu, card, s);

  const humans = roster.filter(r => r.human).length;
  const head = el('div', 'hl-head'); head.append(el('span', '', 'Venter på spillere'), el('span', 'hl-sub', 'Lobby'));
  const rl = el('div', 'hl-roster'); rl.id = 'lobby-roster';
  const blue = roster.filter(r => r.team !== 'red'), red = roster.filter(r => r.team === 'red');
  blue.forEach(r => rl.append(rowEl(r))); if (blue.length && red.length) rl.append(el('div', 'hl-gap')); red.forEach(r => rl.append(rowEl(r)));
  R.append(head, rl, el('div', 'hl-count', `${humans}/${roster.length || humans} SPILLERE`));

  const tick = el('div', 'hl-tick', `Del koden ${code} med dine venner – de kan scanne QR-koden eller åbne linket`);
  wrap.append(L, R, tick);
  if (showCode) {
    const m = el('div', 'hl-modal'), box = el('div', 'hl-mbox'), col = el('div', 'hl-mcol');
    const close = el('button', 'ha-btn primary', 'LUK'); close.id = 'lobby-code-close';
    close.onclick = () => { showCode = false; render(); };
    m.onclick = (e) => { if (e.target === m) close.onclick(); };
    col.append(el('div', 'hl-sub', 'Spilkode'), codeEl, mkShare('ha-btn'), close);
    box.append(qr, col); m.append(box); wrap.append(m);
  }
}

globalThis.addEventListener('hexarena:lobby', (e) => {
  const d = e.detail || {};
  if (d.code) code = d.code;
  if (d.roster) roster = d.roster;
  if (d.status) { status = d.status; error = d.error || ''; if (status === 'error') open = true; }
  render();
});
