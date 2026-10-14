// Bag lobbyen (kampen frosset) vises "RUNDE 1" ikke; efter start vises den i knockout.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${process.env.PORT || 8090}/?lobby=1`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
const txt = () => pg.evaluate(() => __arena.hudUI.modeTexts().center);
const before = await txt(); if (/RUNDE \d/.test(before)) errs.push('RUNDE vises bag lobbyen: ' + before);
await pg.evaluate(() => dispatchEvent(new CustomEvent('hexarena:lobby-start', { detail: { mode: 'local', settings: { mode: 'knockout' } } })));
await pg.waitForFunction(() => globalThis.__arena.started && globalThis.__arena.world.tick > 2, null, { timeout: 5000 }).catch(() => {}); await pg.waitForTimeout(300); const after = await txt(); if (!/RUNDE \d/.test(after)) errs.push('RUNDE mangler efter start: ' + after);
console.log(errs.length ? 'FEJL: ' + errs.join('; ') : 'OK'); await b.close(); process.exit(errs.length ? 1 : 0);
