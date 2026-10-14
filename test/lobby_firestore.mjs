// Manuel live-test mod Firestore (hexarena-d62bbf): publish -> list -> update -> remove. Køres kun med LIVE=1 (rører rigtig database).
if (!process.env.LIVE) { console.log('SKIP (sæt LIVE=1)'); process.exit(0); }
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader'] });
const pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${process.env.PORT || 8090}/?lobbies=firestore&lobby=1`);
const r = await pg.evaluate(async () => {
  const { createLobbyList } = await import('./net/lobbyList.js'); const L = createLobbyList({ backend: 'firestore' }), code = 'TST' + Math.floor(Math.random() * 9000 + 1000), out = { code };
  await L.publish({ code, hostName: 'Vært', mode: 'dom', map: 'harbor_sq_01', count: 1, max: 8, hasCode: true }); out.afterPublish = (await L.list()).find(l => l.code === code) || null;
  await L.publish({ code, hostName: 'Vært', mode: 'dom', map: 'harbor_sq_01', count: 2, max: 8, hasCode: true }); out.afterUpdate = (await L.list()).find(l => l.code === code)?.count ?? null;
  await L.remove(code); out.afterRemove = !!(await L.list()).find(l => l.code === code); return out;
});
if (!r.afterPublish) errs.push('ikke publiceret'); if (r.afterUpdate !== 2) errs.push('update virkede ikke'); if (r.afterRemove) errs.push('ikke fjernet');
console.log(JSON.stringify(r), errs.length ? 'FEJL: ' + errs.join('; ') : 'OK'); await b.close(); process.exit(errs.length ? 1 : 0);
