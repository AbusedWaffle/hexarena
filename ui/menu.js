// Startmenu, klassevalg, sværhedsgrad og holdstørrelse. Indgangspunkt fra index.html.
// Menuen omsætter valget { mode, cls, difficulty, aiSlots } til de URL-parametre, game.js allerede læser,
// og starter så spillet uden genindlæsning. Har URL'en allerede spil-parametre, springes menuen over.
const GAME_KEYS = ['cls', 'diff', 'red', 'blue', 'host', 'room', 'net', 'aidebug'];
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
      <button class="ha-btn" data-go="join">Deltag med kode</button>
      ${saved.cls ? `<div class="hm-sub">Sidst: ${name(saved.cls)}, ${diffName(saved.difficulty)}, ${saved.teamSize} mod ${saved.teamSize}</div>` : ''}
    </div>`, { single, host, join });

  function single() {
    screen(`<button class="ha-btn hm-back" data-go="home">‹ Tilbage</button>
      <div class="hm-label">Vælg klasse</div>${classCards()}<div class="hm-detail"></div>
      <div class="hm-label">Sværhedsgrad</div>
      <div class="ha-seg" data-seg="difficulty">${M.difficulties.map(d => `<button class="ha-btn" data-v="${d.id}">${d.name}</button>`).join('')}</div>
      <div class="hm-sub" data-diffdesc></div>
      <div class="hm-label">Holdstørrelse</div>
      <div class="ha-seg" data-seg="teamSize">${M.teamSizes.map(n => `<button class="ha-btn" data-v="${n}">${n} mod ${n}</button>`).join('')}</div>
      <button class="ha-btn primary" data-start>Start</button>`, { home });
    wireClasses(); wireSeg();
    root.querySelector('[data-start]').onclick = () => { save(); launch({ mode: 'single', cls: st.cls, difficulty: st.difficulty, aiSlots: { blue: st.teamSize - 1, red: st.teamSize } }); };
  }
  function host() {
    screen(`<button class="ha-btn hm-back" data-go="home">‹ Tilbage</button>
      <div class="hm-label">Vælg klasse</div>${classCards()}<div class="hm-detail"></div>
      <div class="hm-label">Robotter på ledige pladser</div>
      <div class="ha-seg" data-seg="difficulty">${M.difficulties.map(d => `<button class="ha-btn" data-v="${d.id}">${d.name}</button>`).join('')}</div>
      <div class="hm-sub">Du får en kode og en QR-kode, som de andre kan bruge. Ledige pladser fyldes med robotter.</div>
      <button class="ha-btn primary" data-start>Opret spil</button>`, { home });
    wireClasses(); wireSeg();
    root.querySelector('[data-start]').onclick = () => { save(); launch({ mode: 'host', cls: st.cls, difficulty: st.difficulty }); };
  }
  function join() {
    screen(`<button class="ha-btn hm-back" data-go="home">‹ Tilbage</button>
      <div class="hm-label">Spilkode</div>
      <input class="hm-code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="•••••">
      <div class="hm-err"></div>
      <div class="hm-label">Vælg klasse</div>${classCards()}<div class="hm-detail"></div>
      <button class="ha-btn primary" data-start>Deltag</button>`, { home });
    wireClasses();
    const inp = root.querySelector('.hm-code'), err = root.querySelector('.hm-err');
    inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); err.textContent = ''; };
    root.querySelector('[data-start]').onclick = () => {
      if (inp.value.length !== 5) { err.textContent = 'Koden er på 5 tegn.'; return; }
      save(); launch({ mode: 'join', code: inp.value, cls: st.cls });
    };
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
    if (choice.mode === 'single') { p.set('diff', choice.difficulty); p.set('blue', choice.aiSlots.blue); p.set('red', choice.aiSlots.red); }
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
  if (new URLSearchParams(location.search).has('host')) await import('./lobby.js');
  import('../render/game.js');
  addCss('art/menu.css'); addCss('ui/menu.css');
  const toMenu = () => { location.href = location.pathname; };
  const again = () => { location.reload(); };
  const btn = el('button', 'ha-btn hm-ingame'); btn.textContent = '≡'; btn.title = 'Menu';
  btn.onclick = () => { if (confirm('Forlad kampen og gå til menuen?')) toMenu(); };
  document.body.appendChild(btn);
  let shown = false;
  setInterval(() => { // knapper når kampen er slut
    const m = globalThis.__arena?.cur?.match; if (!m?.over || shown) return; shown = true;
    const box = el('div', 'hm-over');
    box.innerHTML = `<button class="ha-btn primary">Ny kamp</button><button class="ha-btn">Menu</button>`;
    const [a, b] = box.querySelectorAll('button'); a.onclick = again; b.onclick = toMenu;
    if (qs.has('room')) a.remove(); // klienter kan ikke starte en ny kamp selv
    document.body.appendChild(box);
  }, 500);
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
function addCss(href) { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
