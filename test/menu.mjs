// Menu-flow på en telefon på langs (844×390): forside → robotter → klasse/sværhedsgrad/holdstørrelse → start, husker sidste valg, kode-validering.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
await pg.goto('http://localhost:8090/'); await pg.waitForTimeout(1200);
await pg.screenshot({ path: '/tmp/menu_home.png' });
await pg.tap('text=Spil mod robotter'); await pg.waitForTimeout(500);
await pg.tap('[data-cls=Sniper]'); await pg.tap('[data-v=hard]'); await pg.tap('[data-v="2"]');
await pg.evaluate(() => document.querySelector('.hm-root').scrollTop = 0); await pg.waitForTimeout(150); await pg.screenshot({ path: '/tmp/menu_single.png' });
await pg.screenshot({ path: '/tmp/menu_single_full.png', fullPage: false });
await pg.evaluate(() => document.querySelector('.hm-root').scrollTop = 9999); await pg.waitForTimeout(200);
await pg.screenshot({ path: '/tmp/menu_single_bottom.png' });
await pg.tap('[data-start]'); await pg.waitForTimeout(3500);
const st = await pg.evaluate(() => ({ url: location.search, me: __arena.me.cls, n: __arena.world.players.length, teams: __arena.world.players.map(p => p.team).join(',') }));
await pg.screenshot({ path: '/tmp/menu_game.png' });
// tilbage til menu og deltag-skærm
await pg.goto('http://localhost:8090/'); await pg.waitForTimeout(800);
const last = await pg.textContent('.hm-sub').catch(() => '');
await pg.tap('text=Deltag med kode'); await pg.waitForTimeout(300); await pg.tap('[data-start]');
const err = await pg.textContent('.hm-err');
await pg.screenshot({ path: '/tmp/menu_join.png' });
console.log(JSON.stringify({ st, last, err, errs }));
await b.close();
