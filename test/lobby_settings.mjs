// Lobby: host ændrer indstillinger (hold, bots, sværhedsgrad, runder, længde), klient skifter klasse og får indstillingerne; alt står stille til 'Start kampen'.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const port = process.env.PORT || 8090, errs = [], out = {};
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host: ' + e.message));
await host.goto(`http://localhost:${port}/?host=1&cls=Assault&net=bc`); await host.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 });
const code = await host.evaluate(() => __arena.code);
const set = (s) => host.evaluate((s) => { globalThis.__lobbySettings = s; dispatchEvent(new CustomEvent('hexarena:lobby-settings', { detail: { settings: s } })); }, s);
await set({ teamSize: 2, bots: true, botCount: 2, botDifficulty: 'hard', roundsToWin: 2, roundTimeSec: 45 });
const hs = () => host.evaluate(() => ({ tick: __arena.world.tick, players: __arena.world.players.map(p => p.id + ':' + p.team + ':' + p.cls + (__arena.ai.bots.has(p.id) ? ':bot' : '')), match: { r2w: __arena.world.classes._match.roundsToWin, timeLeft: __arena.world.match.timeLeft } }));
out.efterIndstillinger = await hs();
const cl = await ctx.newPage(); cl.on('pageerror', e => errs.push('klient: ' + e.message));
const got = []; await cl.exposeFunction('__rec', (d) => got.push(d));
await cl.addInitScript(() => addEventListener('hexarena:lobby', (e) => e.detail?.settings && __rec(e.detail.settings)));
await cl.goto(`http://localhost:${port}/?room=${code}&cls=Sniper&net=bc`); await cl.waitForFunction(() => globalThis.__arena?.client?.you, null, { timeout: 30000 });
await cl.waitForTimeout(1500); out.klientFikIndstillinger = got.at(-1) || null;
out.efterJoin = await hs();
await cl.evaluate(() => dispatchEvent(new CustomEvent('hexarena:lobby-class', { detail: { cls: 'Support' } }))); await cl.waitForTimeout(1500);
out.efterKlasseskift = await hs();
await set({ bots: false }); await host.waitForTimeout(500); out.botsFra = await hs();
out.klientSer = await cl.evaluate(() => __arena.world.players.map(p => p.id + ':' + p.cls));
await host.evaluate(() => { globalThis.__lobbyStarted = true; dispatchEvent(new CustomEvent('hexarena:lobby-start')); }); await host.waitForTimeout(2500);
out.efterStart = await hs(); out.klientSer = await cl.evaluate(() => __arena.world.players.map(p => p.id + ':' + p.cls));
console.log(JSON.stringify({ ...out, errors: errs }, null, 0)); await b.close();
const e = out;
const ok = e.efterIndstillinger.players.length === 3 && e.efterIndstillinger.tick === 0 && e.klientFikIndstillinger?.roundTimeSec === 45 && e.efterKlasseskift.players.some(p => p.endsWith(':Support')) && e.efterKlasseskift.players.length === 4 && new Set(e.efterKlasseskift.players.map(p => p.split(':')[0])).size === 4
  && e.botsFra.players.length === 2 && e.klientSer.length === 2 && e.efterStart.match.timeLeft <= 45 && e.efterStart.tick > 0 && e.efterStart.match.r2w === 2 && !errs.length;
if (!ok) { console.error('FEJL'); process.exit(1); }
