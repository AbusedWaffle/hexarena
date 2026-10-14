// Startmenu: forside + deltag med kode. Klasse og indstillinger vælges i lobbyen. Indgangspunkt fra index.html.
// Menuen omsætter valget { mode, cls, difficulty, aiSlots } til de URL-parametre, game.js allerede læser,
// og starter så spillet uden genindlæsning. Har URL'en allerede spil-parametre, springes menuen over.
const GAME_KEYS = ['cls', 'diff', 'red', 'blue', 'host', 'room', 'net', 'aidebug', 'lobby'];
const STORE = 'hexarena.menu.v1';
const qs = new URLSearchParams(location.search);

if (GAME_KEYS.some(k => qs.has(k))) { startGame(); }
else showMenu();

async function showMenu() {
  addCss('art/menu.css'); addCss('ui/menu.css');
  const M = await fetch('data/menu.json').then(r => r.json());
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  const st = { cls: saved.cls || M.defaults.cls, difficulty: saved.difficulty || M.defaults.difficulty, teamSize: saved.teamSize || M.defaults.teamSize };
  const root = el('div', 'ha-screen hm-root'); document.body.appendChild(root);
  const save = () => localStorage.setItem(STORE, JSON.stringify(st));

  const home = () => screen(`
    <div class="hm-col">
      <div class="ha-title">HEXARENA</div>
      <button class="ha-btn primary" data-go="single">Spil mod robotter</button>
      <button class="ha-btn" data-go="host">Opret spil</button>
      <button class="ha-btn" data-go="openGames" id="hm-open-games">ÅBNE SPIL</button>
      <button class="ha-btn" data-go="join">Deltag med kode</button>
      ${saved.cls ? `<div class="hm-sub">Sidst: ${name(saved.cls)}, ${diffName(saved.lobbySettings?.botDifficulty || saved.difficulty)}, ${saved.lobbySettings?.teamSize || saved.teamSize} mod ${saved.lobbySettings?.teamSize || saved.teamSize}</div>` : ''}
    </div>`, { single, host, join, openGames });

  // Klasse, holdstørrelse, robotter og sværhedsgrad vælges nu i lobbyen (ui/lobby.js) – menuen går direkte dertil.
  const ls = () => ({ teamSize: 3, bots: true, botCount: 'fill', botDifficulty: st.difficulty || 'normal', ...(saved.lobbySettings || {}) });
  function single() {
    const s = ls(), t = Math.min(4, s.teamSize), n = !s.bots ? 0 : s.botCount === 'fill' ? 2 * t - 1 : s.botCount;
    const red = Math.min(t, Math.ceil(n / 2)), blue = Math.min(t - 1, n - Math.min(t, Math.ceil(n / 2)));
    launch({ mode: 'single', cls: st.cls, difficulty: s.botDifficulty, aiSlots: { blue, red } });
  }
  function host() { launch({ mode: 'host', cls: st.cls, difficulty: ls().botDifficulty }); }
  function join() {
    screen(`<button class="ha-btn hm-back" data-go="home">‹ Tilbage</button>
      <div class="hm-label">Spilkode</div>
      <input class="hm-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="•••••">
      <div class="hm-err"></div>
      <button class="ha-btn primary" data-start>Deltag</button>
      <div class="hm-sub">Du vælger klasse i lobbyen, mens du venter på host.</div>`, { home });
    const inp = root.querySelector('.hm-code'), err = root.querySelector('.hm-err');
    inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); err.textContent = ''; };
    root.querySelector('[data-start]').onclick = () => {
      if (inp.value.length !== 5) { err.textContent = 'Koden er på 5 tegn.'; return; }
      launch({ mode: 'join', code: inp.value, cls: st.cls });
    };
  }

  // ÅBNE SPIL: liste over offentlige lobbyer (net/lobbyList.js); JOIN går gennem samme vej som "Deltag med kode".
  let olTimer = null;
  async function openGames() {
    const [{ createLobbyList }, modes, maps] = await Promise.all([import('../net/lobbyList.js'),
      fetch('data/modes.json').then(r => r.json()).catch(() => ({})), fetch('data/maps.json').then(r => r.json()).catch(() => ({}))]);
    const LL = createLobbyList();
    const mName = (id) => (modes.modes || []).find(m => m.id === id)?.name || id;
    const bName = (id) => (maps.maps || []).find(m => m.id === id)?.name || id;
    screen(`<div class="hm-ol" id="open-games">
      <div class="hm-ol-head"><button class="ha-btn hm-back" data-go="home">‹ Tilbage</button><div class="hm-ol-title">ÅBNE SPIL</div>
      <button class="ha-btn hm-ol-refresh" id="ol-refresh">OPDATER</button></div>
      <div class="hm-ol-list" id="ol-list"></div></div>`, { home });
    const list = root.querySelector('#ol-list');
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    const refresh = async () => {
      if (!root.contains(list)) { clearInterval(olTimer); olTimer = null; return; }
      const ls = await LL.list();
      list.innerHTML = ls.length ? '' : '<div class="hm-ol-empty">Ingen åbne spil lige nu</div>';
      for (const l of ls) {
        const r = el('div', 'hm-ol-row'); r.dataset.code = l.code;
        r.innerHTML = `<b>${esc(l.hostName)}</b><span>${esc(mName(l.mode))}</span><span>${esc(bName(l.map))}</span><i>${l.count}/${l.max}</i><button class="ha-btn primary hm-ol-join">JOIN</button>`;
        r.querySelector('button').onclick = () => { clearInterval(olTimer); olTimer = null; launch({ mode: 'join', code: l.code, cls: st.cls }); };
        list.append(r);
      }
    };
    root.querySelector('#ol-refresh').onclick = refresh;
    clearInterval(olTimer); olTimer = setInterval(refresh, 15000); refresh();
  }

  // ---- hjælpere ----
  function screen(html, routes) {
    root.innerHTML = html; root.scrollTop = 0;
    for (const b of root.querySelectorAll('[data-go]')) b.onclick = () => (b.dataset.go === 'home' ? home : routes[b.dataset.go])();
  }
  function classCards() {
    return `<div class="ha-cards">${M.classes.map(c => `
      <div class="ha-card" data-cls="${c.id}"><img src="art/icons/${c.id.toLowerCase()}_blue.svg" alt="">
        <div class="name">${c.name}</div><div class="role">${c.role}</div>
        ${Object.entries(c.stats).map(([k, v]) => `<div class="ha-stat"><span style="width:62px;text-align:left">${k}</span><span class="bar">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span></div>`).join('')}
      </div>`).join('')}</div>`;
  }
  function wireClasses() {
    const cards = root.querySelectorAll('[data-cls]'), det = root.querySelector('.hm-detail');
    const sel = () => {
      cards.forEach(c => c.classList.toggle('selected', c.dataset.cls === st.cls));
      const c = M.classes.find(x => x.id === st.cls) || M.classes[0];
      det.innerHTML = `${c.desc}<br><b>${c.weapon}</b> · <b>${c.ability.name}</b>: ${c.ability.desc}`;
    };
    cards.forEach(c => c.onclick = () => { st.cls = c.dataset.cls; sel(); }); sel();
  }
  function wireSeg() {
    for (const seg of root.querySelectorAll('[data-seg]')) {
      const key = seg.dataset.seg, bs = seg.querySelectorAll('button');
      const upd = () => {
        bs.forEach(b => b.classList.toggle('primary', String(st[key]) === b.dataset.v));
        const dd = root.querySelector('[data-diffdesc]'); if (dd && key === 'difficulty') dd.textContent = M.difficulties.find(d => d.id === st.difficulty)?.desc || '';
      };
      bs.forEach(b => b.onclick = () => { st[key] = key === 'teamSize' ? Number(b.dataset.v) : b.dataset.v; upd(); }); upd();
    }
  }
  function name(id) { return M.classes.find(c => c.id === id)?.name || id; }
  function diffName(id) { return M.difficulties.find(d => d.id === id)?.name || id; }
  function launch(choice) {
    const p = new URLSearchParams();
    p.set('cls', choice.cls);
    if (choice.mode === 'single') { p.set('lobby', '1'); p.set('diff', choice.difficulty); p.set('blue', choice.aiSlots.blue); p.set('red', choice.aiSlots.red); }
    if (choice.mode === 'host') { p.set('host', '1'); p.set('diff', choice.difficulty); }
    if (choice.mode === 'join') p.set('room', choice.code);
    history.replaceState(null, '', location.pathname + '?' + p);
    root.remove(); startGame(true);
  }
  home();
}

// Spillet læser URL'en ved indlæsning. fromMenu = startet fra menuen (så "Menu" kan komme tilbage uden parametre).
async function startGame(fromMenu = false) {
  // lobby-overlay skal lytte før spillet melder kode/holdliste
  // Alle kampe går gennem lobbyen (lokal, host og klient); ?lobby=0 springer den over (tests/debug).
  if (new URLSearchParams(location.search).get('lobby') !== '0') await import('./lobby.js');
  await import('./spectate.js'); // tilskuer-bjælke (hexarena:spectate)
  addCss('art/menu.css'); addCss('ui/menu.css');
  import('../render/game.js');
  await import('./ingame.js'); // én samlet in-game-menu (≡) inkl. knapper ved kampens slut
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
function addCss(href) { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
