// Integrations-check: loader spillet i headless Chrome med flere URL-varianter og fanger alle JS-fejl. Kræver serveren på PORT (standard 8090).
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const port = process.env.PORT || 8090;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; pg.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url())); pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
for (const q of ['', '?cls=Sniper', '?cls=Engineer&diff=hard&red=4&blue=3', '?cls=Scout&diff=easy', '?cls=Support&aidebug=1']) {
  await pg.goto(`http://localhost:${port}/${q}`); await pg.waitForTimeout(6000);
}
await pg.screenshot({ path: 'integration_check.png' });
console.log(JSON.stringify({ errors: errs })); await b.close();
