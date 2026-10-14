// Lobby-overlay for host i Modern Warfare 2-pregame-layout (HexArena-stil): menu + kort/kode/QR til venstre,
// holdliste som scoreboard til højre, ticker i bunden.
// Bruges til alle kampe: lokal (mod robotter), host og klient. Menu: START (ikke klient), KLASSE, INDSTILLINGER, VIS KODE/DEL LINK (host), MENU.
// Sender: hexarena:lobby-start {code,mode,cls,settings}, hexarena:lobby-class {cls}, hexarena:lobby-settings {settings}.
// Lytter på 'hexarena:lobby': {code?, status?, error?, roster?, mode?, settings?, isHost?, started?}; roster = [{id, team, cls, human, name}].
import qrcode from '../vendor/qrcode.mjs';

const CSS = `
.hl-wrap{position:fixed;inset:0;z-index:50;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-rows:minmax(0,1fr) auto;gap:0 3vw;
 background:linear-gradient(90deg,rgba(6,9,26,.94),rgba(11,16,48,.86));font-family:var(--ha-font,'Roboto Mono',monospace);color:var(--ha-text,#E6ECFF);
 padding:max(10px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));box-sizing:border-box;overflow:hidden}
.hl-wrap[hidden]{display:none}
.hl-l,.hl-r{display:flex;flex-direction:column;min-height:0;min-width:0;gap:clamp(4px,1.4vh,10px)}
.hl-title{font-size:clamp(15px,4.6vh,30px);font-weight:700;letter-spacing:.18em;line-height:1.1;}
.hl-title small{font-size:.5em;letter-spacing:.14em;opacity:.8;white-space:nowrap}
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
.hl-map img{width:100%;height:100%;object-fit:contain;display:block}
.hl-map.pick{cursor:pointer}.hl-map.pick:hover{border-color:#4FA3FF}
.hl-mapedit{position:absolute;right:6px;top:4px;font-size:10px;letter-spacing:.14em;background:rgba(79,163,255,.3);padding:1px 6px}
.hl-mbox.maps{max-height:calc(100% - 12px)}
.hl-maps{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:6px;padding-right:4px}
.hl-mgl{font-size:11px;letter-spacing:.2em;opacity:.65}
.hl-mrow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.hl-mc{all:unset;cursor:pointer;display:flex;flex-direction:column;background:rgba(34,48,90,.45);border:2px solid var(--ha-edge,#22305A);border-left:4px solid var(--ha-edge,#22305A)}
.hl-mc img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#0B1030;display:block}
.hl-mc .n{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 6px;padding:3px 6px;font-size:12px;letter-spacing:.08em}
.hl-mc .n i{font-style:normal;opacity:.6;font-size:11px}
.hl-mc.sel{border-color:#4FA3FF;box-shadow:0 0 12px rgba(111,160,255,.45);background:rgba(79,163,255,.18)}
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
.hl-wrap.only-panel{background:rgba(6,9,26,.35)}.hl-wrap.only-panel>.hl-l,.hl-wrap.only-panel>.hl-r,.hl-wrap.only-panel>.hl-tick{visibility:hidden}
.hl-mbox.wide{flex-direction:column;align-items:stretch;width:min(92vw,820px);gap:clamp(6px,1.6vh,12px)}
.hl-mhead{display:flex;justify-content:space-between;align-items:center;font-size:clamp(13px,4vh,18px);letter-spacing:.2em}
.hl-mhead .ha-btn{min-height:32px;min-width:0;padding:0 16px;font-size:14px}
.hl-cards{display:flex;gap:8px;justify-content:center}
.hl-cards .ha-card{flex:1;min-width:0;width:auto;padding:6px;cursor:pointer}
.hl-cards .ha-card img{width:clamp(28px,10vh,64px);height:clamp(28px,10vh,64px)}
.hl-cards .ha-card .name{font-size:clamp(12px,3.6vh,16px)}.hl-cards .ha-card .role{font-size:11px;margin-bottom:2px}
.hl-cards .ha-stat span:first-child{width:auto!important;flex:none;min-width:5.5em}
.hl-cards.ro .ha-card{cursor:default}
.hl-det{font-size:clamp(11px,3vh,13px);opacity:.85;min-height:2.4em}.hl-det b{color:var(--ha-score,#FFD75A)}
.hl-set{display:grid;grid-template-columns:1fr 1fr;gap:clamp(4px,1.6vh,12px) 20px}
.hl-set label{display:flex;flex-direction:column;gap:3px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.9}
.hl-set .ha-seg .ha-btn{min-height:clamp(30px,8.5vh,42px);font-size:clamp(12px,3.4vh,15px);padding:0 4px;min-width:0}
.hl-set .ha-seg .ha-btn.primary{box-shadow:0 0 10px rgba(111,160,255,.45)}
.hl-set.ro .ha-seg .ha-btn{pointer-events:none}.hl-set.ro .ha-seg .ha-btn:not(.primary){opacity:.45}
.hl-set .ha-seg .ha-btn:disabled{opacity:.3}
.hl-wait{font-size:clamp(13px,4vh,20px);letter-spacing:.12em;padding:clamp(2px,.9vh,6px) 12px;border-left:3px solid #FFD75A;color:#FFE9A8}
`;

const MODES = { tdm: 'HOLDKAMP', team: 'HOLDKAMP', knockout: 'HOLDKAMP', ffa: 'ALLE MOD ALLE' };
const qs = new URLSearchParams(location.search);
const ICONS = ['assault', 'sniper', 'engineer', 'scout', 'support'];
const STORE = 'hexarena.menu.v1';
const DIFF = { easy: 'LET', normal: 'NORMAL', hard: 'SVÆR' };
// Standard-indstillinger; data/menu.json `lobbySettings` (defaults/options) overskriver hvis den findes.
let OPT = { teamSize: [1, 2, 3, 4], bots: [true, false], botDifficulty: ['easy', 'normal', 'hard'], roundsToWin: [2, 3, 5], roundTimeSec: [45, 60, 75, 90] };
let DEF = { teamSize: 3, bots: true, botCount: 'fill', botDifficulty: 'normal', roundsToWin: 3, roundTimeSec: 75 };

const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const persist = (patch) => { const o = { ...load(), ...patch }; localStorage.setItem(STORE, JSON.stringify(o)); };
let saved = load();
let mode = qs.has('host') ? 'host' : qs.has('room') ? 'client' : 'local';
let cls = qs.get('cls') || saved.cls || 'Assault';
let settings = normalize({ ...DEF, ...(saved.lobbySettings || {}), ...(saved.difficulty && !saved.lobbySettings ? { botDifficulty: saved.difficulty } : {}), ...(saved.teamSize && !saved.lobbySettings ? { teamSize: Math.min(4, saved.teamSize) } : {}) });
let started = false, panel = null, code = mode === 'client' ? qs.get('room') : null, roster = null, status = mode === 'local' ? 'open' : 'connecting', error = '', open = true, map = null, M = null;
let active = mode !== 'local' || qs.get('lobby') === '1'; // lokalt spil viser kun lobbyen med ?lobby=1 (som game.js venter på)
// Udadtil er botCount altid et tal (antal robotter i alt); 'Fyld' sendes som 2·teamSize−1 + botFill:true.
const pub = (x) => ({ ...x, botCount: x.botCount === 'fill' ? 2 * x.teamSize - 1 : x.botCount, botFill: x.botCount === 'fill' });
globalThis.__lobbySettings = pub(settings);

function normalize(x) {
  const t = Number(x.teamSize) || 3, max = 2 * t - 1;
  const bc = x.botCount === 'fill' || x.botCount == null ? 'fill' : Math.max(0, Math.min(max, Number(x.botCount)));
  return { teamSize: t, bots: x.bots !== false, botCount: bc, botDifficulty: x.botDifficulty || 'normal', roundsToWin: Number(x.roundsToWin) || 3, roundTimeSec: Number(x.roundTimeSec) || 75, map: x.map || DEF.map || 'paintyard_sq_01' };
}
const emit = (name, detail) => globalThis.dispatchEvent(new CustomEvent(name, { detail }));
const editable = () => mode !== 'client' && !started;

// Baner fra data/maps.json; kortet i lobbyen viser art/maps/<id>.png (fallback: tegning fra banefilen).
let MAPS = null, mapCache = {};
const mapInfo = () => MAPS?.maps.find(m => m.id === settings.map) || MAPS?.maps.find(m => m.id === MAPS.default) || null;
function loadMapFile() {
  const i = mapInfo(), f = i?.file || 'data/map_paintyard_sq_01.json';
  if (mapCache[f]) { map = mapCache[f]; return; }
  fetch(new URL('../' + f, import.meta.url)).then(r => r.json()).then(m => { mapCache[f] = m; if ((mapInfo()?.file || 'data/map_paintyard_sq_01.json') === f) { map = m; render(); } }).catch(() => {});
}
fetch(new URL('../data/maps.json', import.meta.url)).then(r => r.json()).then(j => {
  MAPS = j; if (!DEF.map) DEF.map = j.default;
  if (!MAPS.maps.some(m => m.id === settings.map)) settings = normalize({ ...settings, map: j.default });
  globalThis.__lobbySettings = pub(settings); loadMapFile(); render();
}).catch(() => loadMapFile());
fetch(new URL('../data/menu.json', import.meta.url)).then(r => r.json()).then(m => {
  M = m; const L = m.lobbySettings;
  if (L) {
    for (const k of Object.keys(OPT)) { const v = L[k]; if (v?.options) OPT[k] = v.options; if (v && 'default' in v) DEF[k] = v.default; }
    if (L.defaults) Object.assign(DEF, L.defaults); if (L.options) Object.assign(OPT, L.options);
    if (!saved.lobbySettings && mode !== 'client') { settings = normalize({ ...DEF, ...(saved.difficulty ? { botDifficulty: saved.difficulty } : {}) }); globalThis.__lobbySettings = pub(settings); }
  }
  render();
}).catch(() => {});

const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
if (!document.querySelector('link[href="art/menu.css"]')) { const l = el('link'); l.rel = 'stylesheet'; l.href = 'art/menu.css'; document.head.append(l); }
const st = el('style'); st.textContent = CSS; document.head.append(st);
const wrap = el('div', 'hl-wrap'); wrap.id = 'lobby';
let panelOnly = false; // panel åbnet fra in-game-menuen (ui/ingame.js): kun panelet vises, luk = tilbage til kampen
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

const iconUrl = (c, team) => { const k = String(c || '').toLowerCase(); return new URL(`../art/icons/${ICONS.includes(k) ? k : 'assault'}_${team === 'red' ? 'red' : 'blue'}.svg`, import.meta.url).href; };
function rowEl(r) {
  const d = el('div', 'hl-p ' + r.team + (r.human ? ' human' : ' bot'));
  const img = el('img'); img.alt = ''; img.src = iconUrl(r.cls, r.team);
  const name = r.human ? (r.id === 'me' ? 'Dig' : (r.name || 'Spiller')) : 'Robot · ' + (r.cls || '');
  d.append(img, el('span', '', name), el('span', 't', r.team === 'red' ? 'RØD' : 'BLÅ'));
  return d;
}

// Forhåndsvisning af holdene ud fra indstillingerne (når spillet ikke har sendt en roster)
// Mennesker tages fra spillets roster (hvis sendt), ledige pladser fyldes med robotter efter indstillingerne.
function previewRoster() {
  const t = settings.teamSize, order = ['Assault', 'Sniper', 'Engineer', 'Scout', 'Support'];
  const out = (roster || []).filter(x => x.human);
  if (!out.some(x => x.id === 'me') && mode !== 'client') out.unshift({ id: 'me', team: 'blue', cls, human: true, name: 'Dig' });
  if (mode === 'client' && !out.length) out.push({ id: 'me', team: 'blue', cls, human: true, name: 'Dig' });
  let b = out.filter(x => x.team !== 'red').length, r = out.length - b;
  const n = Math.min(2 * t - out.length, !settings.bots ? 0 : settings.botCount === 'fill' ? 2 * t - 1 : settings.botCount);
  for (let i = 0; i < n; i++) {
    if (r < t && (r < b || b >= t)) out.push({ id: 'botR' + r, team: 'red', cls: order[r % 5], human: false }), r++;
    else out.push({ id: 'botB' + b, team: 'blue', cls: order[b % 5], human: false }), b++;
  }
  return out;
}

function setSettings(patch) {
  settings = normalize({ ...settings, ...patch });
  const out = pub(settings); globalThis.__lobbySettings = out;
  persist({ lobbySettings: settings, difficulty: settings.botDifficulty, teamSize: settings.teamSize });
  emit('hexarena:lobby-settings', { settings: out });
  loadMapFile();
  render();
}
function setClass(c) {
  cls = c; persist({ cls: c });
  if (roster) roster = roster.map(r => r.id === 'me' ? { ...r, cls: c } : r);
  emit('hexarena:lobby-class', { cls: c });
  render();
}

function render() {
  if (!active || (mode !== 'local' && !code)) return;
  if (!document.body) return void addEventListener('DOMContentLoaded', render, { once: true });
  if (!wrap.isConnected) document.body.append(wrap);
  wrap.hidden = !open; wrap.classList.toggle('only-panel', panelOnly && !!panel);
  if (!open) return;
  wrap.replaceChildren();
  const L = el('div', 'hl-l'), R = el('div', 'hl-r');
  const menu = el('div', 'hl-menu'), items = [];
  const mi = (txt, id, fn, extra = '') => { const b = el('button', 'hl-mi ha-btn' + extra, txt); if (id) b.id = id; b.onclick = fn; items.push(b); return b; };
  if (mode !== 'client') {
    mi(started ? 'TILBAGE TIL KAMPEN' : 'START KAMPEN', 'lobby-start', () => {
      open = false; panel = null;
      // første tryk starter kampen: game.js holder simulering/rundeur stille indtil dette event (sendes kun én gang)
      if (!started) { started = true; globalThis.__lobbyStarted = true; emit('hexarena:lobby-start', { code, mode, cls, settings: pub(settings) }); }
      render();
    }, ' sel primary');
  } else {
    if (started) mi('TILBAGE TIL KAMPEN', 'lobby-start', () => { open = false; panel = null; render(); }, ' sel primary');
    else { const w = el('div', 'hl-wait', 'Venter på host…'); w.id = 'lobby-wait'; menu.append(w); }
  }
  mi('KLASSE', 'lobby-class', () => { panel = 'class'; render(); });
  mi('INDSTILLINGER', 'lobby-settings', () => { panel = 'settings'; render(); });
  const mkShare = (c) => { const b = el('button', c, navigator.share ? 'DEL LINK' : 'KOPIÉR LINK');
    b.onclick = async () => {
      try { if (navigator.share) await navigator.share({ title: 'HexArena', text: 'Spil med! Kode ' + code, url: link() }); else { await navigator.clipboard.writeText(link()); b.textContent = 'KOPIERET ✓'; } }
      catch { try { await navigator.clipboard.writeText(link()); b.textContent = 'KOPIERET ✓'; } catch {} }
    }; return b; };
  if (mode === 'host') {
    mi('VIS KODE', 'lobby-show-code', () => { panel = 'code'; render(); });
    const sh = mkShare('hl-mi ha-btn'); sh.id = 'lobby-share'; items.push(sh);
  }
  mi('MENU', null, () => { location.href = location.pathname; });
  for (const b of items) b.onmouseenter = () => items.forEach(x => x.classList.toggle('sel', x === b));
  menu.append(...items);

  const card = el('div', 'hl-card');
  const mi_ = mapInfo(), mp = el('div', 'hl-map' + (editable() ? ' pick' : '')); mp.id = 'lobby-map';
  if (mi_) { const im = el('img'); im.alt = ''; im.src = new URL(`../art/maps/${mi_.id}.png`, import.meta.url).href; im.onerror = () => im.replaceWith(drawMap()); mp.append(im); } else mp.append(drawMap());
  const mn = el('div', 'hl-mapname', mi_?.name || map?.name || 'Paintyard'); mn.id = 'lobby-map-name'; mp.append(mn);
  if (editable()) { mp.append(el('div', 'hl-mapedit', 'SKIFT BANE')); mp.onclick = () => { panel = 'map'; render(); }; }
  if (code) mp.append(el('div', 'hl-mapcode', 'KODE ' + code));
  card.append(mp);
  const s = el('div', 'hl-status' + (status === 'error' ? ' err' : ''),
    status === 'error' ? 'Netværksfejl: ' + error : mode === 'local' ? 'Kamp mod robotter · ' + DIFF[settings.botDifficulty] : mode === 'client' ? (status === 'open' ? 'Forbundet – venter på at host starter' : 'Forbinder til ' + code + '…') : status === 'open' ? 'Klar – venner kan nu deltage med koden' : 'Opretter spil…');
  s.id = 'lobby-status';
  const t = settings.teamSize;
  const tt = el('div', 'hl-title', MODES[(qs.get('mode') || '').toLowerCase()] || 'HOLDKAMP'); tt.id = 'lobby-title';
  tt.append(el('small', '', ` · ${t} MOD ${t} · FØRST TIL ${settings.roundsToWin}`));
  L.append(tt, menu, card, s);

  const list = previewRoster();
  const humans = list.filter(r => r.human).length;
  const head = el('div', 'hl-head'); head.append(el('span', '', mode === 'local' ? 'Holdene' : 'Venter på spillere'), el('span', 'hl-sub', mode === 'local' ? 'Mod robotter' : 'Lobby'));
  const rl = el('div', 'hl-roster'); rl.id = 'lobby-roster';
  const blue = list.filter(r => r.team !== 'red'), red = list.filter(r => r.team === 'red');
  blue.forEach(r => rl.append(rowEl(r))); if (blue.length && red.length) rl.append(el('div', 'hl-gap')); red.forEach(r => rl.append(rowEl(r)));
  R.append(head, rl, el('div', 'hl-count', `${humans}/${2 * t} SPILLERE`));

  const tick = el('div', 'hl-tick', mode === 'host' ? `Del koden ${code} med dine venner – de kan scanne QR-koden eller åbne linket`
    : mode === 'client' ? `Du er med i spil ${code} – vælg klasse, mens du venter på at host starter kampen`
    : `${t} mod ${t} · robotter: ${DIFF[settings.botDifficulty]} · først til ${settings.roundsToWin} runder · ${settings.roundTimeSec} s pr. runde`);
  wrap.append(L, R, tick);
  if (panel) wrap.append(modal());
}

function modal() {
  const m = el('div', 'hl-modal'), close = el('button', 'ha-btn primary', 'LUK');
  close.id = panel === 'code' ? 'lobby-code-close' : 'lobby-panel-close';
  close.onclick = () => { panel = null; if (panelOnly) { panelOnly = false; open = false; } render(); };
  m.onclick = (e) => { if (e.target === m) close.onclick(); };
  if (panel === 'code') {
    const box = el('div', 'hl-mbox'), col = el('div', 'hl-mcol');
    const q = qrcode(0, 'M'); q.addData(link()); q.make();
    const qr = el('div', 'hl-qr'); qr.id = 'lobby-qr'; qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const codeEl = el('div', 'hl-code', code); codeEl.id = 'lobby-code';
    const sh = el('button', 'ha-btn', navigator.share ? 'DEL LINK' : 'KOPIÉR LINK');
    sh.onclick = () => document.getElementById('lobby-share')?.click();
    col.append(el('div', 'hl-sub', 'Spilkode'), codeEl, sh, close);
    box.append(qr, col); m.append(box); return m;
  }
  if (panel === 'map' && !(editable() && MAPS)) { panel = null; return el('div'); }
  const box = el('div', 'hl-mbox wide' + (panel === 'map' ? ' maps' : '')); box.id = { class: 'lobby-class-panel', map: 'lobby-map-panel' }[panel] || 'lobby-settings-panel';
  const head = el('div', 'hl-mhead');
  head.append(el('span', '', panel === 'class' ? 'VÆLG KLASSE' : panel === 'map' ? 'VÆLG BANE' : 'INDSTILLINGER' + (editable() ? '' : started ? ' · KAN ÆNDRES I LOBBYEN' : ' · KUN HOST')), close);
  box.append(head);
  if (panel === 'map') {
    const list = el('div', 'hl-maps'), order = ['small', 'medium', 'large'];
    for (const sz of order) {
      const ms = MAPS.maps.filter(m => m.size === sz).sort((a, b) => a.width * a.height - b.width * b.height); if (!ms.length) continue;
      const row = el('div', 'hl-mrow');
      for (const m of ms) {
        const c = el('button', 'hl-mc' + (m.id === settings.map ? ' sel' : '')); c.dataset.map = m.id;
        const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.src = new URL(`../art/maps/${m.id}.png`, import.meta.url).href;
        const n = el('div', 'n'); const nm = el('span', '', m.name); const i = el('i', '', `${m.width}×${m.height} · ${m.players[0] === m.players[1] ? m.players[0] : m.players.join('–')} pr. hold`);
        n.append(nm, i); c.append(im, n);
        c.onclick = () => { panel = null; setSettings({ map: m.id }); };
        row.append(c);
      }
      list.append(el('div', 'hl-mgl', (MAPS.sizes?.[sz] || sz).toUpperCase()), row);
    }
    box.append(list); m.append(box); return m;
  }
  if (panel === 'class') {
    const classes = M?.classes || ICONS.map(i => ({ id: i[0].toUpperCase() + i.slice(1), name: i[0].toUpperCase() + i.slice(1), role: '', stats: {} }));
    const cards = el('div', 'hl-cards' + (started ? ' ro' : '')), det = el('div', 'hl-det');
    for (const c of classes) {
      const d = el('div', 'ha-card' + (c.id === cls ? ' selected' : '')); d.dataset.cls = c.id;
      d.innerHTML = `<img src="${iconUrl(c.id, 'blue')}" alt=""><div class="name">${c.name}</div><div class="role">${c.role || ''}</div>` +
        Object.entries(c.stats || {}).map(([k, v]) => `<div class="ha-stat"><span>${k}</span><span class="bar">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
      if (!started) d.onclick = () => setClass(c.id);
      cards.append(d);
    }
    const c = classes.find(x => x.id === cls) || classes[0];
    if (c?.desc) det.innerHTML = `${c.desc} <b>${c.weapon}</b> · <b>${c.ability.name}</b>: ${c.ability.desc}`;
    box.append(cards, det);
  } else {
    const ed = editable(), grid = el('div', 'hl-set' + (ed ? '' : ' ro')), max = 2 * settings.teamSize - 1;
    const seg = (label, key, opts) => {
      const lb = el('label'); lb.append(label); const sg = el('div', 'ha-seg'); sg.dataset.k = key;
      for (const [v, txt, dis] of opts) {
        const b = el('button', 'ha-btn' + (String(settings[key]) === String(v) ? ' primary' : ''), txt); b.dataset.v = String(v);
        if (dis) b.disabled = true;
        b.onclick = () => { if (!editable()) return; if (key === 'botCount' && (v === '-' || v === '+')) { const cur = settings.botCount === 'fill' ? max : settings.botCount; return setSettings({ botCount: Math.max(0, Math.min(max, cur + (v === '+' ? 1 : -1))) }); } setSettings({ [key]: v }); };
        sg.append(b);
      }
      lb.append(sg); grid.append(lb);
    };
    seg('Holdstørrelse', 'teamSize', OPT.teamSize.map(n => [n, `${n} mod ${n}`]));
    seg('Robotter', 'bots', [[true, 'Til'], [false, 'Fra']]);
    const off = !settings.bots, nNow = settings.botCount === 'fill' ? max : settings.botCount;
    seg(`Antal robotter (0–${max})`, 'botCount', [['fill', 'Fyld', off], ['-', '−', off || nNow <= 0], [nNow, String(nNow), off], ['+', '+', off || nNow >= max]]);
    seg('Robotternes niveau', 'botDifficulty', OPT.botDifficulty.map(d => [d, M?.difficulties?.find(x => x.id === d)?.name || d]));
    seg('Først til (runder)', 'roundsToWin', OPT.roundsToWin.map(n => [n, String(n)]));
    seg('Rundetid', 'roundTimeSec', OPT.roundTimeSec.map(n => [n, n + ' s']));
    // tælleren viser værdi uden at være "valgt" som en knap
    grid.querySelector('[data-k=botCount] [data-v="' + nNow + '"]')?.classList.toggle('primary', settings.botCount !== 'fill' && !off);
    box.append(grid);
  }
  m.append(box); return m;
}

// Fra render/game.js: detail = {code?, status?, error?, roster?, mode?, settings?, isHost?, started?}
globalThis.addEventListener('hexarena:lobby', (e) => {
  const d = e.detail || {};
  active = true;
  if (d.mode) mode = d.mode; else if (d.isHost === true) mode = 'host'; else if (d.isHost === false) mode = 'client';
  if (d.code) code = d.code;
  if (d.roster) roster = d.roster;
  if (d.settings && mode === 'client') { settings = normalize(d.settings.botFill ? { ...d.settings, botCount: 'fill' } : d.settings); globalThis.__lobbySettings = pub(settings); loadMapFile(); }
  if (d.started && !started) { started = true; if (mode === 'client') { open = false; panel = null; } }
  if (d.status) { status = d.status; error = d.error || ''; if (status === 'error') open = true; }
  render();
});
// API til in-game-menuen (ui/ingame.js)
globalThis.__lobbyUI = {
  mode: () => mode, code: () => code, isOpen: () => open && !wrap.hidden,
  openLobby() { panelOnly = false; panel = null; open = true; render(); },
  openPanel(p) { panelOnly = true; panel = p; open = true; render(); },
};
render();
