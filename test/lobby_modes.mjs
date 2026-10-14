// Spiltilstande i lobbyen (844×390 og 1280×720): TILSTAND-panel med [data-mode], valg giver settings.mode i lobby-settings og lobby-start,
// banevælgeren filtreres efter maps.json `modes` (uden felt = knockout/tdm/kc; ingen match = alle + note), ugyldig bane skiftes, titel, gemmes.
// Forventede baner læses fra de rigtige data/maps.json (`modes` pr. bane).
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const PORT = process.env.PORT || 8090, P = process.env.SHOT_PREFIX || '/tmp/lobby_modes';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], res = {};
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 1000, deviceScaleFactor: w < 1000 ? 2 : 1 });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(`${w}: ` + e.message));
  await pg.goto(`http://localhost:${PORT}/?cls=Assault&lobby=1`); await pg.waitForSelector('#lobby-mode'); await pg.waitForTimeout(1200);
  await pg.evaluate(() => { globalThis.__ev = []; for (const n of ['hexarena:lobby-settings', 'hexarena:lobby-start']) addEventListener(n, e => __ev.push([n, e.detail])); });
  const ok = {};
  const inView = (sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  await pg.$eval('#lobby-mode', e => e.click()); await pg.waitForTimeout(200);
  const NM = (await pg.evaluate(() => fetch('data/modes.json').then(r => r.json()))).modes.length;
  ok.panel = await inView('#lobby-mode-panel') && (await pg.$$('#lobby-mode-panel [data-mode]')).length === NM && await pg.$eval('#lobby-mode-panel .hl-modes', e => e.scrollHeight <= e.clientHeight + 1)
    && await pg.$$eval('#lobby-mode-panel [data-mode]', es => es.every(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  await pg.screenshot({ path: `${P}_${w}.png` });
  await pg.$eval('#lobby-panel-close', e => e.click());
  const mapsIn = () => pg.$$eval('#lobby-map-panel [data-map]', es => es.map(e => e.dataset.map));
  const MAPS = await pg.evaluate(() => fetch('data/maps.json').then(r => r.json()));
  const expect = Object.fromEntries(['knockout', 'tdm', 'kc', 'dom', 'hp', 'hq', 'invasion'].map(id => [id, MAPS.maps.filter(m => (m.modes || ['knockout', 'tdm', 'kc']).includes(id)).map(m => m.id)]));
  // start på en lille knockout-bane, så skift til HQ skal vælge en gyldig bane selv
  await pg.$eval('#lobby-map', e => e.click()); await pg.waitForTimeout(150); await pg.$eval('[data-map=alley_sq_01]', e => e.click()); await pg.waitForTimeout(150);
  for (const id of ['hq', 'tdm', 'kc', 'dom', 'hp', 'invasion', 'knockout']) {
    await pg.$eval('#lobby-mode', e => e.click()); await pg.waitForTimeout(100);
    await pg.$eval(`#lobby-mode-panel [data-mode=${id}]`, e => e.click()); await pg.waitForTimeout(200);
    const st = await pg.evaluate(() => ({ s: __lobbySettings, last: __ev.filter(([n]) => n === 'hexarena:lobby-settings').at(-1)?.[1].settings, t: document.querySelector('#lobby-title').textContent, store: JSON.parse(localStorage.getItem('hexarena.menu.v1')).lobbySettings }));
    const o = { payload: st.s.mode === id && st.last?.mode === id && st.store.mode === id };
    o.title = id === 'knockout' ? /HOLDKAMP · \d MOD \d · FØRST TIL \d/.test(st.t) : st.t.startsWith({ tdm: 'TEAM DEATHMATCH', kc: 'KILL CONFIRMED', dom: 'DOMINATION', hp: 'HARDPOINT', hq: 'HEADQUARTERS', invasion: 'INVASION · 20 MOD 20 · FØRST TIL 100' }[id]) && /FØRST TIL \d{2,}/.test(st.t);
    await pg.$eval('#lobby-map', e => e.click()); await pg.waitForTimeout(150);
    const got = await mapsIn(), note = !!(await pg.$('#lobby-map-note'));
    const ex = expect[id];
    o.maps = ex.length ? ex.every(m => got.includes(m)) && got.length === ex.length && !note : note;
    o.validMap = ex.includes(st.s.map);
    if (id === 'hq') o.autoMap = st.s.map !== 'alley_sq_01' && ex.includes(st.s.map);
    if (id === 'invasion') {
      await pg.screenshot({ path: `${P}_invasion_maps_${w}.png` });
      o.slagmark = (await pg.textContent('#lobby-map-panel')).includes('SLAGMARK');
      await pg.$eval('#lobby-panel-close', e => e.click()); await pg.waitForTimeout(150);
      // kompakt holdliste: højst ~6 rækker, robotter som '+N robotter', panelet flyder ikke over
      o.roster = await pg.evaluate(() => { const rl = document.querySelector('#lobby-roster'), rows = rl.querySelectorAll('.hl-p'); const r = rl.getBoundingClientRect();
        return rows.length <= 6 && /\+\d+ robotter/.test(rl.textContent) && rl.scrollHeight <= rl.clientHeight + 1 && r.bottom <= innerHeight; });
      o.count = (await pg.textContent('.hl-count')).includes('/40 SPILLERE');
      await pg.screenshot({ path: `${P}_invasion_${w}.png` });
    } else await pg.$eval('#lobby-panel-close', e => e.click());
    ok[id] = o;
  }
  // dom igen og start: lobby-start har mode; derefter skrivebeskyttet
  await pg.$eval('#lobby-mode', e => e.click()); await pg.$eval('[data-mode=dom]', e => e.click()); await pg.waitForTimeout(100);
  await pg.$eval('#lobby-start', e => e.click()); await pg.waitForTimeout(200);
  ok.startPayload = await pg.evaluate(() => __ev.find(([n]) => n === 'hexarena:lobby-start')?.[1].settings.mode === 'dom');
  await pg.evaluate(() => __lobbyUI.openLobby()); await pg.$eval('#lobby-mode', e => e.click()); await pg.$eval('[data-mode=tdm]', e => e.click());
  ok.readOnlyAfterStart = await pg.evaluate(() => __lobbySettings.mode === 'dom') && (await pg.textContent('#lobby-mode-panel')).includes('KAN ÆNDRES I LOBBYEN');
  // persistens: ny side husker tilstanden
  const p2 = await ctx.newPage(); await p2.goto(`http://localhost:${PORT}/?cls=Assault&lobby=1`); await p2.waitForSelector('#lobby-title'); await p2.waitForTimeout(1200);
  ok.persist = await p2.evaluate(() => __lobbySettings.mode === 'dom' && document.querySelector('#lobby-title').textContent.startsWith('DOMINATION'));
  // klient ser hostens tilstand
  await p2.evaluate(() => {}); const c = await ctx.newPage(); await c.goto(`http://localhost:${PORT}/?room=ABCDE&net=bc&cls=Scout`); await c.waitForTimeout(1500);
  await c.evaluate(() => dispatchEvent(new CustomEvent('hexarena:lobby', { detail: { mode: 'client', settings: { teamSize: 4, bots: true, botCount: 7, botDifficulty: 'normal', roundsToWin: 3, roundTimeSec: 75, map: 'canal_sq_01', mode: 'kc' } } })));
  await c.waitForTimeout(150);
  ok.client = await c.evaluate(() => __lobbySettings.mode === 'kc' && document.querySelector('#lobby-title').textContent.startsWith('KILL CONFIRMED · 4 MOD 4'));
  res[w] = ok; await ctx.close();
}
console.log(JSON.stringify({ res, errs })); await b.close();
const flat = (o) => Object.values(o).every(v => typeof v === 'object' ? flat(v) : !!v);
process.exit(flat(res) && !errs.length ? 0 : 1);
