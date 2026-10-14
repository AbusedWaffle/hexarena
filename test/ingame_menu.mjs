// In-game-menu (ui/ingame.js) ved 844×390 og 1280×720: ≡ rører ikke ur/score/minikort, ingen #lobby-chip efter start,
// punkter pr. tilstand (lokal uden VIS KODE, host med), FORTSÆT lukker, TILBAGE TIL LOBBYEN åbner #lobby, INDSTILLINGER skrivebeskyttet.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const PORT = process.env.PORT || 8090, P = process.env.SHOT_PREFIX || '/tmp/ingame_menu';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], res = {};
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 1000, deviceScaleFactor: w < 1000 ? 2 : 1 });
  for (const mode of ['local', 'host']) {
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(`${w} ${mode}: ` + e.message));
    await pg.goto(`http://localhost:${PORT}/?cls=Assault&${mode === 'host' ? 'host=1&net=bc' : 'lobby=1'}`);
    await pg.waitForFunction(() => globalThis.__arena?.cur && document.querySelector('#lobby-start'), null, { timeout: 30000 }); await pg.waitForTimeout(800);
    await pg.$eval('#lobby-start', e => e.click()); await pg.waitForTimeout(1500);
    const ok = {};
    ok.noChip = !(await pg.$('#lobby-chip')) && await pg.$eval('#lobby', e => e.hidden);
    // HUD-regioner i logiske koordinater (render/hud.js): score+ur+rundeprikker x 440–840, y 0–60; minikort øverst til højre
    ok.noOverlap = await pg.evaluate(() => {
      const c = document.querySelector('canvas').getBoundingClientRect(), k = c.width / 1280;
      const R = (x0, y0, x1, y1) => ({ l: c.left + x0 * k, t: c.top + y0 * k, r: c.left + x1 * k, b: c.top + y1 * k });
      const hud = __arena.hudUI, mini = hud?.mini;
      const regions = [R(440, 0, 840, 60), R(1280 - 16 - (mini?.w || 160), 0, 1280, 16 + (mini?.h || 110)), R(1150 - 60, 560 - 60, 1150 + 60, 560 + 60)];
      const sb = document.querySelector('#spectate-bar'); if (sb && !sb.hidden) { const r = sb.getBoundingClientRect(); regions.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); }
      const m = document.querySelector('#ingame-menu-btn').getBoundingClientRect();
      return m.width > 20 && regions.every(g => m.right <= g.l || m.left >= g.r || m.bottom <= g.t || m.top >= g.b);
    });
    await pg.screenshot({ path: `${P}_${w}_${mode}_closed.png` });
    await pg.tap('#ingame-menu-btn'); await pg.waitForTimeout(200);
    const ids = await pg.$$eval('#ingame-menu .hi-mi', es => es.map(e => e.id));
    ok.items = ['im-continue', 'im-settings', 'im-lobby', 'im-leave'].every(i => ids.includes(i)) && (mode === 'host' ? ids.includes('im-code') : !ids.includes('im-code'));
    ok.menuInView = await pg.$eval('#ingame-menu .hi-box', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await pg.screenshot({ path: `${P}_${w}_${mode}_open.png` });
    // tryk i menuen må ikke skyde (input): seq-frame efter tryk har ingen fire
    await pg.evaluate(() => { const I = __arena.input_, f = I.frame.bind(I); globalThis.__fired = 0; I.frame = (...a) => { const r = f(...a); if (r?.fire) __fired++; return r; }; });
    await pg.tap('#im-continue'); await pg.waitForTimeout(300);
    ok.continueCloses = await pg.$eval('#ingame-menu', e => e.hidden);
    ok.noShot = await pg.evaluate(() => __fired === 0);
    await pg.tap('#ingame-menu-btn'); await pg.tap('#im-settings'); await pg.waitForTimeout(200);
    ok.settingsRo = await pg.$eval('#lobby-settings-panel', e => e.textContent.includes('KAN ÆNDRES I LOBBYEN') && !!e.querySelector('.hl-set.ro'));
    await pg.$eval('#lobby-panel-close', e => e.click()); await pg.waitForTimeout(100);
    ok.settingsBack = await pg.$eval('#lobby', e => e.hidden);
    if (mode === 'host') { await pg.tap('#ingame-menu-btn'); await pg.tap('#im-code'); await pg.waitForTimeout(150); ok.code = /^[A-Z0-9]{5}$/.test((await pg.textContent('#lobby-code')).trim()); await pg.$eval('#lobby-code-close', e => e.click()); }
    await pg.tap('#ingame-menu-btn'); await pg.tap('#im-lobby'); await pg.waitForTimeout(150);
    ok.lobby = !(await pg.$eval('#lobby', e => e.hidden)) && (await pg.textContent('#lobby-start')).includes('TILBAGE TIL KAMPEN');
    // afbryd → lobby igen, indstillinger kan ændres, ny start
    await pg.$eval('#lobby-start', e => e.click()); await pg.waitForTimeout(300);
    await pg.evaluate(() => { globalThis.__starts = 0; addEventListener('hexarena:lobby-start', () => __starts++); });
    await pg.tap('#ingame-menu-btn'); await pg.waitForTimeout(100);
    ok.resetItem = !!(await pg.$('#im-reset'));
    await pg.tap('#im-reset'); await pg.waitForTimeout(100);
    ok.confirm = (await pg.textContent('#ingame-menu')).includes('Afbryd kampen? Alle sendes tilbage til lobbyen.');
    await pg.tap('#im-reset-yes'); await pg.waitForTimeout(800);
    ok.resetLobby = !(await pg.$eval('#lobby', e => e.hidden)) && (await pg.textContent('#lobby-start')).includes('START KAMPEN') && await pg.evaluate(() => !globalThis.__lobbyStarted);
    await pg.$eval('#lobby-settings', e => e.click()); await pg.waitForTimeout(100);
    ok.noRoNote = !(await pg.textContent('#lobby-settings-panel')).includes('KAN ÆNDRES') && !(await pg.$('#lobby-settings-panel .hl-set.ro'));
    await pg.$eval('[data-k=roundTimeSec] [data-v="45"]', e => e.click()); await pg.waitForTimeout(100);
    ok.settingChanged = await pg.evaluate(() => __lobbySettings.roundTimeSec === 45);
    await pg.$eval('#lobby-panel-close', e => e.click());
    const t0 = await pg.evaluate(() => __arena.world.tick);
    await pg.$eval('#lobby-start', e => e.click()); await pg.waitForTimeout(1500);
    ok.restart = await pg.evaluate((t0) => __starts === 1 && __lobbyStarted === true && __arena.world.tick > t0, t0);
    // automatisk menu ved kampens slut
    await pg.evaluate(() => { __arena.world.match.over = true; }); await pg.waitForTimeout(1200);
    ok.endMenu = !(await pg.$eval('#ingame-menu', e => e.hidden)) && (await pg.textContent('#ingame-menu')).includes('KAMPEN ER SLUT') && !!(await pg.$('#im-again'));
    if (w === 844) await pg.screenshot({ path: `${P}_${w}_${mode}_end.png` });
    if (mode === 'host') {
      const code = await pg.evaluate(() => __arena.code);
      const cl = await ctx.newPage(); cl.on('pageerror', e => errs.push('klient: ' + e.message));
      await cl.goto(`http://localhost:${PORT}/?room=${code}&net=bc&cls=Scout`); await cl.waitForTimeout(3000);
      await cl.evaluate(() => __ingameMenu.open()); await cl.waitForTimeout(100);
      ok.clientNoReset = !(await cl.$('#im-reset')) && !!(await cl.$('#im-continue'));
      await cl.close();
    }
    res[`${w}_${mode}`] = ok; await pg.close();
  }
  await ctx.close();
}
console.log(JSON.stringify({ res, errs })); await b.close();
process.exit(Object.values(res).every(o => Object.values(o).every(Boolean)) && !errs.length ? 0 : 1);
