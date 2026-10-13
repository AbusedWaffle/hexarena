// Baneskift i lobbyen: host vælger bane via lobbySettings.map; klient (også sent joinet) får samme bane; spawns og kasser følger banen.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const port = process.env.PORT || 8090, errs = [], out = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host: ' + e.message));
await host.goto(`http://localhost:${port}/?host=1&net=bc`); await host.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 });
const code = await host.evaluate(() => __arena.code);
const set = (s) => host.evaluate((s) => { globalThis.__lobbySettings = { ...globalThis.__lobbySettings, ...s }; dispatchEvent(new CustomEvent('hexarena:lobby-settings', { detail: { settings: s } })); }, s);
const info = (pg) => pg.evaluate(() => { const w = __arena.world, sp = w.map.spawns; const onSide = w.players.filter(p => p.alive).every(p => { const t = { x: Math.floor(p.x / 48), y: Math.floor(p.y / 48) }; return t.x >= 0 && t.y >= 0 && t.x < w.map.width && t.y < w.map.height && w.tiles.get(t.x + ',' + t.y)?.type === 'floor'; });
  return { id: w.map.id, size: w.map.width + 'x' + w.map.height, tiles: w.tiles.size, crates: [...w.tiles.values()].filter(t => t.type === 'crate').length, players: w.players.length, onFloor: onSide }; });
const cl = await ctx.newPage(); cl.on('pageerror', e => errs.push('klient: ' + e.message));
await cl.goto(`http://localhost:${port}/?room=${code}&net=bc`); await cl.waitForFunction(() => globalThis.__arena?.client?.you, null, { timeout: 30000 });
await set({ map: 'alley_sq_01', teamSize: 2 }); await host.waitForTimeout(1500);
out.hostGyden = await info(host); out.klientGyden = await info(cl);
await set({ map: 'factory_sq_01', teamSize: 4 }); await host.waitForTimeout(1500);
out.hostFabrik = await info(host); out.klientFabrik = await info(cl);
const sent = await ctx.newPage(); sent.on('pageerror', e => errs.push('sen: ' + e.message));
await sent.goto(`http://localhost:${port}/?room=${code}&net=bc`); await sent.waitForFunction(() => globalThis.__arena?.client?.you, null, { timeout: 30000 }); await sent.waitForTimeout(1500);
out.senJoin = await info(sent);
await host.evaluate(() => { globalThis.__lobbyStarted = true; dispatchEvent(new CustomEvent('hexarena:lobby-start')); }); await host.waitForTimeout(3000);
out.efterStart = await info(host); out.tick = await host.evaluate(() => __arena.world.tick);
await sent.close(); await cl.close(); await host.close();
const local = await ctx.newPage(); local.on('pageerror', e => errs.push('lokal: ' + e.message));
await local.goto(`http://localhost:${port}/?map=canal_sq_01&lobby=0`); await local.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); out.lokalKanal = await info(local);
console.log(JSON.stringify({ ...out, errors: errs })); await b.close();
const o = out;
const ok = o.hostGyden.id === 'alley_sq_01' && o.klientGyden.id === 'alley_sq_01' && o.hostGyden.crates === o.klientGyden.crates && o.hostGyden.onFloor && o.hostGyden.players === 4
  && o.hostFabrik.id === 'factory_sq_01' && o.klientFabrik.id === 'factory_sq_01' && o.hostFabrik.players === 8 && o.hostFabrik.onFloor && o.senJoin.id === 'factory_sq_01' && o.senJoin.crates === o.hostFabrik.crates
  && o.efterStart.id === 'factory_sq_01' && o.tick > 0 && o.lokalKanal.id === 'canal_sq_01' && !errs.length;
if (!ok) { console.error('FEJL'); process.exit(1); }
