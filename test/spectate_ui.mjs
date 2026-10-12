// Tilskuer-bjælke (ui/spectate.js) på 844×390: falske 'hexarena:spectate'-events → tekst/synlighed, hint kun ved count>1,
// tryk på skærmen sender 'hexarena:spectate-next' én gang (debounce), tryk på ≡-knappen gør ikke, id:null skjuler.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const PORT = process.env.PORT || 8090;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${PORT}/?blue=2&red=1&lobby=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForTimeout(800);
await pg.evaluate(() => { globalThis.__nx = 0; addEventListener('hexarena:spectate-next', () => __nx++); });
const fire = (d) => pg.evaluate((d) => dispatchEvent(new CustomEvent('hexarena:spectate', { detail: d })), d);
const vis = () => pg.$eval('#spectate-bar', e => !e.hidden && e.getBoundingClientRect().height > 0);
const ok = {};
await fire({ id: 'botB0', cls: 'Sniper', name: 'Sniper', count: 1 });
ok.one = (await vis()) && (await pg.textContent('#spectate-bar')).includes('SER: Holdkammerat · Sniper') && !(await pg.textContent('#spectate-bar')).includes('Tryk');
await pg.touchscreen.tap(420, 250); await pg.waitForTimeout(100); ok.noTapWhenOne = await pg.evaluate(() => __nx === 0);
await fire({ id: 'p2', cls: 'Scout', name: 'Maja', count: 3 });
ok.multi = (await pg.textContent('#spectate-bar')).includes('SER: Maja · Scout') && (await pg.textContent('#spectate-bar')).includes('Tryk for at skifte');
ok.inView = await pg.$eval('#spectate-bar', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
// under score/ur (canvas-top + 50/720 af højden) og under lobby-chip/≡
ok.belowHud = await pg.$eval('#spectate-bar', e => { const c = document.querySelector('canvas').getBoundingClientRect(); return e.getBoundingClientRect().top >= c.top + c.height * 52 / 720; });
await pg.screenshot({ path: process.env.SHOT || '/tmp/spec_ui_1.png' });
await pg.touchscreen.tap(420, 250); await pg.touchscreen.tap(430, 250); await pg.waitForTimeout(100);
ok.tapOnce = await pg.evaluate(() => __nx === 1);
await pg.waitForTimeout(300); await pg.$eval('.hm-ingame', e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
ok.buttonIgnored = await pg.evaluate(() => __nx === 1);
await fire({ id: null }); ok.hidden = !(await vis());
await pg.touchscreen.tap(420, 250); ok.noTapWhenHidden = await pg.evaluate(() => __nx === 1);
console.log(JSON.stringify({ ...ok, errs })); await b.close();
process.exit(Object.values(ok).every(Boolean) && !errs.length ? 0 : 1);
