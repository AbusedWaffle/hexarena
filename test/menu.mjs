// Menu-flow (844×390): forside → 'Spil mod robotter' går direkte i lobbyen, 'Opret spil' giver host-lobby med VIS KODE,
// 'Deltag med kode' har kun kodefelt + validering. Sidste valg (fra lobbyen) vises på forsiden.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8090, U = `http://localhost:${PORT}/`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
await pg.goto(U); await pg.waitForTimeout(1200);
await pg.screenshot({ path: process.env.SHOT || '/tmp/menu_home.png' });
await pg.tap('text=Spil mod robotter'); await pg.waitForTimeout(2500);
const local = await pg.evaluate(() => ({ url: location.search, lobby: !!document.querySelector('#lobby:not([hidden]) #lobby-start'), noCode: !document.querySelector('#lobby-show-code'), cards: !!document.querySelector('.hm-root') }));
await pg.$eval('#lobby-class', e => e.click()); await pg.$eval('[data-cls=Sniper]', e => e.click());
await pg.$eval('#lobby-panel-close', e => e.click()); await pg.$eval('#lobby-settings', e => e.click());
await pg.$eval('[data-k=teamSize] [data-v="2"]', e => e.click()); await pg.$eval('[data-k=botDifficulty] [data-v=hard]', e => e.click());
await pg.goto(U); await pg.waitForTimeout(800);
const last = await pg.textContent('.hm-sub').catch(() => '');
await pg.tap('text=Opret spil'); await pg.waitForTimeout(2500);
const host = await pg.evaluate(() => ({ url: location.search, show: !!document.querySelector('#lobby-show-code') }));
await pg.goto(U); await pg.waitForTimeout(800);
await pg.tap('text=Deltag med kode'); await pg.waitForTimeout(300);
const joinNoCards = !(await pg.$('[data-cls]'));
await pg.tap('[data-start]'); const err = await pg.textContent('.hm-err');
console.log(JSON.stringify({ local, last, host, joinNoCards, err, errs }));
await b.close();
const pass = local.lobby && local.noCode && !local.cards && last.includes('Sniper, Svær, 2 mod 2') && host.url.includes('host=1') && host.show && joinNoCards && err.includes('5 tegn') && !errs.length;
process.exit(pass ? 0 : 1);
