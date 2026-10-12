// Lobby (844×390 som standard; VW/VH kan sættes): host – VIS KODE (kode+QR), KLASSE (Sniper → hexarena:lobby-class),
// INDSTILLINGER (2 mod 2, Svær, først til 5, 60 s → __lobbySettings), klient ser indstillinger skrivebeskyttet og ingen START,
// start/luk/chip. Lokal tilstand: ingen kode/VIS KODE/DEL LINK. Skærmbilleder: SHOT_PREFIX_*.png.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8090, VW = +(process.env.VW || 844), VH = +(process.env.VH || 390), P = process.env.SHOT_PREFIX || '/tmp/lobby';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const errs = [];
const newPage = async (url) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(`http://localhost:${PORT}/${url}`); await p.waitForTimeout(2500); return p; };
const inView = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
const click = (p, sel) => p.$eval(sel, e => e.click());
const pg = await newPage('?host=1&net=bc&cls=Assault');
await pg.evaluate(() => { globalThis.__ev = []; for (const n of ['hexarena:lobby-class', 'hexarena:lobby-settings', 'hexarena:lobby-start']) addEventListener(n, e => __ev.push([n, e.detail])); });
const ok = { startVisible: await inView(pg, '#lobby-start'), showVisible: await inView(pg, '#lobby-show-code') };
await pg.screenshot({ path: P + '_main.png' });
await click(pg, '#lobby-show-code'); await pg.waitForTimeout(200);
const code = (await pg.textContent('#lobby-code')).trim();
Object.assign(ok, { code: /^[A-Z0-9]{5}$/.test(code), codeVisible: await inView(pg, '#lobby-code'), qrVisible: await inView(pg, '#lobby-qr svg'), closeVisible: await inView(pg, '#lobby-code-close') });
await pg.screenshot({ path: P + '_code.png' });
await click(pg, '#lobby-code-close'); await pg.waitForTimeout(100);
ok.codeClosed = !(await pg.$('#lobby-code'));
// KLASSE
await click(pg, '#lobby-class'); await pg.waitForTimeout(200);
ok.classPanelInView = await inView(pg, '#lobby-class-panel') && await inView(pg, '#lobby-panel-close');
await click(pg, '#lobby-class-panel [data-cls=Sniper]'); await pg.waitForTimeout(150);
await pg.screenshot({ path: P + '_class.png' });
ok.classEvent = await pg.evaluate(() => __ev.some(([n, d]) => n === 'hexarena:lobby-class' && d.cls === 'Sniper') && JSON.parse(localStorage.getItem('hexarena.menu.v1')).cls === 'Sniper');
await click(pg, '#lobby-panel-close'); await pg.waitForTimeout(100);
// INDSTILLINGER
await click(pg, '#lobby-settings'); await pg.waitForTimeout(200);
ok.settingsPanelInView = await inView(pg, '#lobby-settings-panel');
for (const [k, v] of [['teamSize', '2'], ['botDifficulty', 'hard'], ['roundsToWin', '5'], ['roundTimeSec', '60']]) { await click(pg, `[data-k=${k}] [data-v="${v}"]`); await pg.waitForTimeout(80); }
await pg.screenshot({ path: P + '_settings.png' });
const s = await pg.evaluate(() => globalThis.__lobbySettings);
ok.settings = s.botCount === 3 && s.botFill === true && s.teamSize === 2 && s.botDifficulty === 'hard' && s.roundsToWin === 5 && s.roundTimeSec === 60;
ok.settingsEvent = await pg.evaluate(() => __ev.filter(([n]) => n === 'hexarena:lobby-settings').length === 4);
ok.title = (await pg.textContent('#lobby-title')).includes('2 MOD 2 · FØRST TIL 5');
await click(pg, '#lobby-panel-close');
// klient
const cl = await newPage(`?room=${code}&net=bc&cls=Sniper`);
await cl.evaluate(() => dispatchEvent(new CustomEvent('hexarena:lobby', { detail: { mode: 'client', settings: { teamSize: 2, bots: true, botCount: 'fill', botDifficulty: 'hard', roundsToWin: 5, roundTimeSec: 60 } } })));
await cl.waitForTimeout(150);
ok.clientNoStart = !(await cl.$('#lobby-start')) && !(await cl.$('#lobby-show-code')) && (await cl.textContent('#lobby-wait')).includes('Venter på host');
await click(cl, '#lobby-settings'); await cl.waitForTimeout(150);
ok.clientReadOnly = await cl.$eval('#lobby-settings-panel .hl-set', e => e.classList.contains('ro'));
await click(cl, '#lobby-settings-panel [data-k=roundTimeSec] [data-v="90"]');
ok.clientUnchanged = await cl.evaluate(() => __lobbySettings.roundTimeSec === 60);
await cl.screenshot({ path: P + '_client.png' });
await pg.bringToFront(); await pg.waitForTimeout(1500);
ok.joinShown = (await pg.textContent('#lobby-roster')).includes('Spiller');
await click(pg, '#lobby-start'); await pg.waitForTimeout(200);
ok.startEvents = await pg.evaluate(() => globalThis.__lobbyStarted === true && __ev.filter(([n]) => n === 'hexarena:lobby-start').length === 1);
ok.closed = await pg.$eval('#lobby', e => e.hidden) && await inView(pg, '#lobby-chip');
await click(pg, '#lobby-chip'); ok.reopen = !(await pg.$eval('#lobby', e => e.hidden));
// lokal
const lo = await newPage('?cls=Scout&diff=normal&lobby=1');
ok.local = !!(await lo.$('#lobby-start')) && !(await lo.$('#lobby-show-code')) && !(await lo.$('#lobby-share')) && !(await lo.$('.hl-mapcode')) && (await lo.$$('#lobby-roster .hl-p')).length > 1;
await lo.screenshot({ path: P + '_local.png' });
console.log(JSON.stringify({ codeStr: code, ...ok, errs }));
await b.close();
process.exit(Object.values(ok).every(Boolean) && !errs.length ? 0 : 1);
