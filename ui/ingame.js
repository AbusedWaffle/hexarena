// Én samlet in-game-menu: ≡-knap øverst til venstre (uden for ur/score/minikort) åbner et panel i lobby-stil:
// FORTSÆT · INDSTILLINGER (lobbyens panel, skrivebeskyttet under kamp) · VIS KODE (kun netspil) · TILBAGE TIL LOBBYEN · FORLAD KAMPEN.
// Når kampen er slut, åbnes menuen selv med NY KAMP (ikke klienter) og MENU.
const CSS = `
.hm-ingame{position:fixed;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));z-index:30;min-width:0;min-height:36px;width:44px;padding:0;font-size:20px;opacity:.8}
.hi-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(6,9,26,.72);font-family:var(--ha-font,'Roboto Mono',monospace);color:var(--ha-text,#E6ECFF)}
.hi-wrap[hidden]{display:none}
.hi-box{display:flex;flex-direction:column;min-width:min(340px,80vw);max-height:calc(100% - 16px);overflow:auto;padding:clamp(10px,3vh,20px) clamp(14px,3vw,24px);background:var(--ha-panel,#0B1030);border:1px solid var(--ha-edge,#22305A);border-left:4px solid #4FA3FF;box-sizing:border-box}
.hi-title{font-size:clamp(15px,4.6vh,24px);font-weight:700;letter-spacing:.25em;margin-bottom:clamp(4px,1.5vh,10px)}
.hi-mi{all:unset;cursor:pointer;font-size:clamp(13px,4.2vh,19px);letter-spacing:.12em;padding:clamp(3px,1.1vh,7px) 12px;border-left:3px solid transparent;opacity:.8}
.hi-mi:hover,.hi-mi.sel{opacity:1;border-left-color:#4FA3FF;background:linear-gradient(90deg,rgba(79,163,255,.4),rgba(79,163,255,0))}
.hi-mi.warn:hover{border-left-color:#FF5A5A;background:linear-gradient(90deg,rgba(255,90,90,.35),rgba(255,90,90,0))}
`;
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const st = el('style'); st.textContent = CSS; document.head.append(st);
const qs = new URLSearchParams(location.search);
const L = () => globalThis.__lobbyUI;
const mode = () => L()?.mode() || (qs.has('host') ? 'host' : qs.has('room') ? 'client' : 'local');
const over = () => !!globalThis.__arena?.cur?.match?.over;

const btn = el('button', 'ha-btn hm-ingame', '≡'); btn.id = 'ingame-menu-btn'; btn.title = 'Menu';
const wrap = el('div', 'hi-wrap'); wrap.id = 'ingame-menu'; wrap.hidden = true;
document.body.append(btn, wrap);

function close() { wrap.hidden = true; }
function open() {
  wrap.replaceChildren();
  const box = el('div', 'hi-box'), items = [];
  box.append(el('div', 'hi-title', over() ? 'KAMPEN ER SLUT' : 'MENU'));
  const mi = (txt, id, fn, cls = '') => { const b = el('button', 'hi-mi ' + cls, txt); b.id = id; b.onclick = fn; items.push(b); };
  if (over()) {
    if (mode() !== 'client') mi('NY KAMP', 'im-again', () => location.reload());
    mi('LUK', 'im-continue', close);
  } else mi('FORTSÆT', 'im-continue', close);
  if (L()) mi('INDSTILLINGER', 'im-settings', () => { close(); L().openPanel('settings'); });
  if (L() && mode() !== 'local' && L().code()) mi('VIS KODE', 'im-code', () => { close(); L().openPanel('code'); });
  if (L() && !over()) mi('TILBAGE TIL LOBBYEN', 'im-lobby', () => { close(); L().openLobby(); });
  mi(over() ? 'MENU' : 'FORLAD KAMPEN', 'im-leave', () => { location.href = location.pathname; }, 'warn');
  items[0].classList.add('sel');
  for (const b of items) b.onmouseenter = () => items.forEach(x => x.classList.toggle('sel', x === b));
  box.append(...items); wrap.append(box); wrap.hidden = false;
}
btn.onclick = () => (wrap.hidden ? open() : close());
wrap.onclick = (e) => { if (e.target === wrap) close(); };
let shownOver = false;
setInterval(() => { if (over() && !shownOver) { shownOver = true; if (!L()?.isOpen()) open(); } }, 500);
globalThis.__ingameMenu = { open, close };
