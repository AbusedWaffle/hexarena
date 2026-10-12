// Host: simuleringen og uret står stille i lobbyen, indtil 'Start kampen' trykkes. Lokalt spil starter med det samme.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
const port = process.env.PORT || 8090, out = {}, errs = [];
const st = (pg) => pg.evaluate(() => { const w = __arena.world; return { tick: w.tick, timeLeft: +w.match.timeLeft.toFixed(2) }; });
for (const [name, q] of [['host', '?host=1&cls=Assault&net=bc'], ['local', '?cls=Assault&red=1'], ['lokalLobby', '?cls=Assault&red=1&lobby=1']]) {
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/${q}`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 });
  const a = await st(pg); await pg.waitForTimeout(3000); const c = await st(pg); out[name] = { før: a, efter3s: c };
  if (name !== 'local') { await pg.evaluate(() => document.getElementById('lobby-start')?.click() ?? dispatchEvent(new CustomEvent('hexarena:lobby-start'))); await pg.waitForTimeout(3000); out[name].efterStart = await st(pg); }
}
console.log(JSON.stringify({ ...out, errors: errs })); await b.close();
const ok = out.lokalLobby.før.tick === out.lokalLobby.efter3s.tick && out.lokalLobby.efterStart.tick > 0 && out.host.før.tick === out.host.efter3s.tick && out.host.efterStart.tick > out.host.efter3s.tick && out.local.efter3s.tick > out.local.før.tick && !errs.length;
if (!ok) { console.error('FEJL'); process.exit(1); }
