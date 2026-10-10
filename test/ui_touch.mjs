// UI-test af InputSystem med ægte multitouch (CDP). Kræver playwright + serveren på 8090. Udskriver InputFrames med fire/ability.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true });
const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
await pg.goto('http://localhost:8090/?cls=Assault&red=0'); await pg.waitForTimeout(2500);
await pg.evaluate(() => { const a = globalThis.__arena, f = a.input_.frame; a.__log = []; a.input_.frame = () => { const r = f(); if (r.fire || r.ability) a.__log.push(JSON.stringify(r)); return r; }; });
const pos = () => pg.evaluate(() => ({ x: Math.round(__arena.me.x), y: Math.round(__arena.me.y) }));
const cdp = await ctx.newCDPSession(pg);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const p0 = await pos();
await T('touchStart', [{ x: 200, y: 500, id: 1 }]);
for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 200 - i * 12, y: 500, id: 1 }]); await pg.waitForTimeout(40); }
await pg.waitForTimeout(800); const p1 = await pos();
await T('touchStart', [{ x: 128, y: 500, id: 1 }, { x: 900, y: 400, id: 2 }]);
for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 128, y: 500, id: 1 }, { x: 900 - i * 12, y: 400 - i * 6, id: 2 }]); await pg.waitForTimeout(40); }
await pg.waitForTimeout(150); await pg.screenshot({ path: '/workspace/hexarena/ui_touch.png' });
await T('touchEnd', [{ x: 128, y: 500, id: 1 }]); // slip skud-fingeren
await pg.waitForTimeout(200); await T('touchEnd', []);
// tap = auto
await T('touchStart', [{ x: 1000, y: 300, id: 3 }]); await pg.waitForTimeout(60); await T('touchEnd', []); await pg.waitForTimeout(200);
// cancel: træk ud og tilbage
await T('touchStart', [{ x: 1000, y: 300, id: 4 }]); await T('touchMove', [{ x: 1060, y: 300, id: 4 }]); await pg.waitForTimeout(60); await T('touchMove', [{ x: 1003, y: 301, id: 4 }]); await pg.waitForTimeout(60); await T('touchEnd', []); await pg.waitForTimeout(200);
// ability: træk fra knappen
await T('touchStart', [{ x: 1150, y: 560, id: 5 }]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: 1150 - i * 15, y: 560 - i * 8, id: 5 }]); await pg.waitForTimeout(40); }
await pg.screenshot({ path: '/workspace/hexarena/ui_touch_ability.png' });
await T('touchEnd', []); await pg.waitForTimeout(300);
console.log('pos', JSON.stringify(p0), JSON.stringify(p1));
console.log(await pg.evaluate(() => __arena.__log.join('\n')));
console.log('errors:', JSON.stringify(errs));
await b.close();
