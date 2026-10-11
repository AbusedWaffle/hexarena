// Kamera: egen spiller i midten af skærmen (også ved banens kant), zoom ≈ 14×8 tiles synligt.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${process.env.PORT || 8090}/?red=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.waitForTimeout(4000);
const at = () => pg.evaluate(() => { const a = __arena, c = a.cameras.main, me = a.me; return { zoom: +c.zoom.toFixed(3), tilesVisible: [+(c.worldView.width / 48).toFixed(1), +(c.worldView.height / 48).toFixed(1)], meScreen: [Math.round((me.x - c.worldView.x) * c.zoom), Math.round((me.y - c.worldView.y) * c.zoom)] }; });
const start = await at();
await pg.keyboard.down('d'); await pg.waitForTimeout(5000); await pg.keyboard.up('d'); await pg.waitForTimeout(1500); // gå mod banens kant
const edge = await at(); await pg.screenshot({ path: 'camera_check.png' });
console.log(JSON.stringify({ start, edge, errors: errs })); await b.close();
