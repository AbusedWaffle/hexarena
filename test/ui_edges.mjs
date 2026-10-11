// Tjekker at joystick og skud virker fra de sorte kanter uden for canvas (bred telefon, 1600×720). MX=60 = i kanten.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 720 }, hasTouch: true, isMobile: true });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('http://localhost:8090/?red=0'); await pg.waitForTimeout(2500);
await pg.evaluate(() => { const a = __arena, f = a.input_.frame; a.__log = []; a.input_.frame = () => { const r = f(); if (r.fire || Math.hypot(r.move.x, r.move.y) > 0) a.__log.push(JSON.stringify({ m: r.move, f: r.fire, a: r.aim })); return r; }; });
const cdp = await ctx.newCDPSession(pg); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
// canvas er 1280 bred, centreret -> sorte kanter x<160 og x>1440. Tryk i kanterne.
await pg.waitForTimeout(3500); // vent på runde-intro
await T('touchStart', [{ x: Number(process.env.MX||60), y: 600, id: 1 }]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: Number(process.env.MX||60), y: 600 - i * 12, id: 1 }]); await pg.waitForTimeout(40); }
await pg.waitForTimeout(300); await T('touchEnd', []);
await T('touchStart', [{ x: 1550, y: 300, id: 2 }]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: 1550 - i * 12, y: 300, id: 2 }]); await pg.waitForTimeout(40); }
await T('touchEnd', []); await pg.waitForTimeout(300);
const log = await pg.evaluate(() => __arena.__log);
console.log('move frames', log.filter(l => !l.includes('"f":true')).length, 'fire', log.filter(l => l.includes('"f":true')));
console.log(JSON.stringify(errs)); await b.close();
