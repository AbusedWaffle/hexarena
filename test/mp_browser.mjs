// Multiplayer i to browser-faner: host (?host=1) + klient (?room=KODE). NET=bc (standard) bruger BroadcastChannel i samme browser;
// NET=peer bruger PeerJS/WebRTC (kræver et miljø, hvor WebRTC kan oprette forbindelse – ikke den fælles box).
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const port = process.env.PORT || 8090, base = `http://localhost:${port}/`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const NET = process.env.NET || 'bc', Q = NET === 'bc' ? '&net=bc' : '';
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [], watch = (pg, tag) => { pg.on('pageerror', e => errs.push(tag + ': ' + e.message)); pg.on('console', m => m.type() === 'error' && errs.push(tag + ': ' + m.text())); };
const host = await (NET === 'bc' ? ctx : await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); watch(host, 'host');
await host.goto(base + '?host=1&cls=Sniper' + Q);
await host.waitForFunction(() => globalThis.__arena?.code && /Spilkode/.test(globalThis.__arena.netMsg?.text || ''), null, { timeout: 30000 });
const code = await host.evaluate(() => __arena.code);
const cl = await (NET === 'bc' ? ctx : await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); watch(cl, 'klient');
await cl.goto(base + '?room=' + code + '&cls=Scout' + Q);
try { await cl.waitForFunction(() => globalThis.__arena?.cur && __arena.client?.you, null, { timeout: 30000 }); } catch (e) { console.log('KLIENT TIMEOUT', JSON.stringify({ msg: await cl.evaluate(() => globalThis.__arena?.netMsg?.text), you: await cl.evaluate(() => globalThis.__arena?.client?.you), hostMsg: await host.evaluate(() => __arena.netMsg.text), errs })); await b.close(); process.exit(1); }
const t0 = await host.evaluate(() => __arena.world.tick); await cl.keyboard.down('d'); await cl.waitForTimeout(6000); await cl.keyboard.up('d');
await cl.keyboard.press('Space'); await cl.waitForTimeout(3000); const t1 = await host.evaluate(() => __arena.world.tick);
const hs = await host.evaluate(() => ({ hostTick: __arena.world.tick, text: __arena.netMsg.text, players: __arena.world.players.map(p => ({ id: p.id, cls: p.cls, team: p.team, x: Math.round(p.x), y: Math.round(p.y), bot: __arena.ai.bots.has(p.id) })) }));
const cs = await cl.evaluate(() => { const me = __arena.client.world.players.find(p => p.id === 'me'); return { you: __arena.client.you, me: { x: Math.round(me.x), y: Math.round(me.y), cls: me.cls, team: me.team }, tick: __arena.cur.tick, score: __arena.cur.match.score }; });
const hostMe = hs.players.find(p => p.id === cs.you);
await host.screenshot({ path: 'mp_host.png' }); await cl.screenshot({ path: 'mp_client.png' });
console.log(JSON.stringify({ code, hostTicksDuringTest: t1 - t0, hostText: hs.text, client: cs, hostViewOfClient: hostMe, posDiffPx: hostMe ? Math.round(Math.hypot(hostMe.x - cs.me.x, hostMe.y - cs.me.y)) : null, errors: errs }, null, 1));
await b.close();
