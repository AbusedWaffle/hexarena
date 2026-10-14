// ?mode=<id>&lobby=0 starter en lokal kamp direkte i tilstanden (til visuelle tests).
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
for (const [mode, map] of [['dom', 'harbor_sq_01'], ['hp', 'city_sq_01'], ['kc', 'paintyard_sq_01'], ['hq', 'city_sq_01']]) {
  await pg.goto(`http://localhost:${process.env.PORT || 8090}/?mode=${mode}&map=${map}&lobby=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForFunction(() => globalThis.__arena.world.tick > 0, null, { timeout: 3000 }).catch(() => errs.push('tick står på 0 efter 3 s'));
  const r = await pg.evaluate(() => { const a = globalThis.__arena; return { mode: a.cur.match.mode, map: a.world.map.id, obj: a.cur.objectives?.length, wobj: a.world.match.objectives?.length, tick: a.world.tick, tl: a.world.match.timeLeft }; });
  if (r.mode !== mode || r.map !== map || (mode !== 'kc' && !r.obj)) errs.push(`${mode}: ${JSON.stringify(r)}`); console.log(mode, JSON.stringify(r));
}
console.log(errs.length ? 'FEJL: ' + errs.join('; ') : 'OK'); await b.close(); process.exit(errs.length ? 1 : 0);
