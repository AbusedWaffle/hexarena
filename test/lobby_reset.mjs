// (ticks går langsomt med to sider i headless swiftshader, så der tjekkes started-flag og frysning.)
// hexarena:lobby-reset: host afbryder kampen -> alt fryses, klient får started:false, indstillinger (fx bane) kan ændres, ny start virker.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const port = process.env.PORT || 8090, errs = [], out = {}, ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host: ' + e.message));
await host.goto(`http://localhost:${port}/?host=1&net=bc`); await host.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 });
const code = await host.evaluate(() => __arena.code);
const cl = await ctx.newPage(); cl.on('pageerror', e => errs.push('klient: ' + e.message));
const got = []; await cl.exposeFunction('__rec', (d) => got.push(d)); await cl.addInitScript(() => addEventListener('hexarena:lobby', (e) => 'started' in (e.detail || {}) && __rec(e.detail.started)));
await cl.goto(`http://localhost:${port}/?room=${code}&net=bc`); await cl.waitForFunction(() => globalThis.__arena?.client?.you, null, { timeout: 30000 });
const ev = (n, d) => host.evaluate(([n, d]) => dispatchEvent(new CustomEvent(n, { detail: d })), [n, d]);
const hs = () => host.evaluate(() => ({ started: __arena.started, tick: __arena.world.tick, map: __arena.world.map.id }));
await ev('hexarena:lobby-start', {}); await host.waitForTimeout(2500); out.start = await hs();
await ev('hexarena:lobby-reset'); await host.waitForTimeout(300); const a = await hs(); await host.waitForTimeout(1500); out.reset = a; out.frosset = (await hs()).tick === a.tick;
await host.evaluate(() => { globalThis.__lobbySettings = { ...globalThis.__lobbySettings, map: 'alley_sq_01' }; dispatchEvent(new CustomEvent('hexarena:lobby-settings', { detail: { settings: { map: 'alley_sq_01' } } })); }); await host.waitForTimeout(1500);
out.bane = await hs(); out.klientBane = await cl.evaluate(() => __arena.world.map.id); out.klientStarted = got;
await ev('hexarena:lobby-start', {}); await host.waitForTimeout(2500); out.igen = await hs();
console.log(JSON.stringify({ ...out, errors: errs })); await b.close();
const o = out, ok = o.start.started && !o.reset.started && o.frosset && o.bane.map === 'alley_sq_01' && o.klientBane === 'alley_sq_01' && o.klientStarted.includes(false) && o.igen.started && o.igen.tick >= 1 && !errs.length;
if (!ok) { console.error('FEJL'); process.exit(1); }
