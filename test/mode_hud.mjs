// Tilstands-HUD (render/hud.js) for dom/hp/hq ved 844×390 og 1280×720: objektiver i snapshot, chips/labels vises,
// HP-nedtælling, scorebjælke-område rører ikke ≡, ur-tekst eller minikort; skærmbilleder SHOT_PREFIX_<mode>_<w>.png.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const PORT = process.env.PORT || 8090, P = process.env.SHOT_PREFIX || '/tmp/mode_hud';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], res = {};
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 1000, deviceScaleFactor: w < 1000 ? 2 : 1 });
  for (const [mode, mapId, direct] of [['dom', 'warehouse_sq_01'], ['hp', 'canal_sq_01'], ['hq', 'factory_sq_01'], ['dom', 'harbor_sq_01', true]]) {
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(`${w} ${mode}: ` + e.message));
    if (direct) { // Lead: ?mode=&map=&lobby=0 starter direkte (her Havnen, KÆMPE-bane → mindre minikort)
      await pg.goto(`http://localhost:${PORT}/?mode=${mode}&map=${mapId}&lobby=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForTimeout(3500);
    } else {
      await pg.goto(`http://localhost:${PORT}/?cls=Assault&lobby=1`); await pg.waitForFunction(() => globalThis.__arena?.cur && document.querySelector('#lobby-mode'), null, { timeout: 30000 }); await pg.waitForTimeout(600);
      await pg.$eval('#lobby-mode', e => e.click()); await pg.$eval(`[data-mode=${mode}]`, e => e.click()); await pg.waitForTimeout(150);
      await pg.$eval('#lobby-map', e => e.click()); await pg.$eval(`[data-map=${mapId}]`, e => e.click()); await pg.waitForTimeout(800);
      await pg.$eval('#lobby-start', e => e.click()); await pg.waitForTimeout(3500);
    }
    const ok = await pg.evaluate(({ mode }) => {
      const s = __arena.cur, t = __arena.hudUI.modeTexts(), o = {};
      o.mode = s.match.mode === mode; o.objectives = (s.objectives || []).length > 0; o.labels = t.labels.length > 0;
      if (mode === 'hp') o.countdown = /ZONEN FLYTTER OM \d:\d\d/.test(t.mode);
      const c = document.querySelector('canvas').getBoundingClientRect(), k = c.width / 1280;
      const R = (x0, y0, x1, y1) => ({ l: c.left + x0 * k, t: c.top + y0 * k, r: c.left + x1 * k, b: c.top + y1 * k });
      const hit = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
      const mapW = __arena.world.map.width, mapH = __arena.world.map.height, tile = Math.min(5, 150 / mapW, 100 / mapH);
      const modeHud = R(520, 56, 760, 136), mini = R(1280 - 16 - mapW * tile - 3, 0, 1280, 16 + mapH * tile + 3), clock = R(590, 14, 690, 50);
      const mb = document.querySelector('#ingame-menu-btn').getBoundingClientRect(), menu = { l: mb.left, t: mb.top, r: mb.right, b: mb.bottom };
      o.noOverlap = !hit(modeHud, menu) && !hit(modeHud, mini) && !hit(modeHud, clock) && !hit(menu, mini);
      return o;
    }, { mode });
    await pg.screenshot({ path: `${P}_${mode}${direct ? '_' + mapId : ''}_${w}.png` });
    res[`${w}_${mode}${direct ? '_' + mapId : ''}`] = ok; await pg.close();
  }
  await ctx.close();
}
console.log(JSON.stringify({ res, errs })); await b.close();
process.exit(Object.values(res).every(o => Object.values(o).every(Boolean)) && !errs.length ? 0 : 1);
