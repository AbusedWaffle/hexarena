// Død: kamera følger holdkammerat efter 1 s; 'hexarena:spectate-next' skifter; tilbage til egen figur ved ny runde.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${process.env.PORT || 8090}/?blue=2&red=1&lobby=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForTimeout(3000);
await pg.evaluate(() => { const m = __arena.me; m.hp = 0; m.alive = false; });
await pg.waitForTimeout(400); const early = await pg.evaluate(() => globalThis.__spectate?.id ?? null);
await pg.waitForTimeout(1500);
const st = () => pg.evaluate(() => { const s = globalThis.__spectate, p = __arena.cur.players.find(q => q.id === s?.id), t = __arena.camTarget; return { id: s?.id, count: s?.count, dist: p ? Math.round(Math.hypot(p.x - t.x, p.y - t.y)) : -1 }; });
const first = await st();
await pg.evaluate(() => dispatchEvent(new CustomEvent('hexarena:spectate-next'))); await pg.waitForTimeout(500);
const second = await st();
const ok = early === null && first.id && first.dist < 30 && (first.count < 2 || second.id !== first.id) && !errs.length;
console.log(JSON.stringify({ early, first, second, errors: errs })); await b.close();
if (!ok) { console.error('FEJL'); process.exit(1); }
