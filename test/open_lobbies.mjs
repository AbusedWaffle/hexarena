// ÅBNE SPIL (fake backend via localStorage): tom tilstand, værten publicerer sin lobby (anden fane), rækken vises med navn/tilstand/bane/antal,
// JOIN går gennem deltag-med-kode-vejen (?room=KODE), og lobbyen fjernes, når værten starter. Kører ved 844×390 og 1280×720.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8090, U = `http://localhost:${PORT}/`, P = process.env.SHOT || '/tmp/open_lobbies';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const out = {}; let ok = true;
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; const watch = (pg) => { pg.on('pageerror', e => errs.push(e.message)); return pg; };
  const pg = watch(await ctx.newPage());
  await pg.goto(U); await pg.evaluate(() => localStorage.removeItem('hexarena.fakeLobbies')); await pg.reload(); await pg.waitForTimeout(800);
  await pg.click('#hm-open-games'); await pg.waitForTimeout(500);
  const empty = (await pg.textContent('#ol-list')).includes('Ingen åbne spil lige nu');
  await pg.screenshot({ path: `${P}_empty_${w}.png` });
  // vært i anden fane (fake-backend deles via localStorage)
  const host = watch(await ctx.newPage());
  await host.goto(U + '?host=1&cls=Assault'); await host.waitForTimeout(3000);
  const hcode = await host.evaluate(() => globalThis.__lobbyUI?.code());
  // flere lobbyer til layout-tjek
  await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('hexarena.fakeLobbies') || '{}'), t = Date.now();
    o.ZZZZ1 = { code: 'ZZZZ1', hostName: 'Ida', mode: 'invasion', map: 'battlefield_sq_01', count: 3, max: 40, hasCode: true, updatedAt: t - 1000 };
    o.OLD01 = { code: 'OLD01', hostName: 'Gammel', mode: 'tdm', map: 'paintyard_sq_01', count: 1, max: 6, hasCode: true, updatedAt: t - 10 * 60e3 };
    localStorage.setItem('hexarena.fakeLobbies', JSON.stringify(o)); });
  await pg.click('#ol-refresh'); await pg.waitForTimeout(500);
  const rows = await pg.$$eval('.hm-ol-row', rs => rs.map(r => ({ code: r.dataset.code, text: r.innerText.replace(/\s+/g, ' ') })));
  const fits = await pg.evaluate(() => { const r = document.querySelector('.hm-ol').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && [...document.querySelectorAll('.hm-ol-join')].every(b => b.getBoundingClientRect().right <= innerWidth); });
  await pg.screenshot({ path: `${P}_list_${w}.png` });
  const hostRow = rows.find(r => r.code === hcode);
  // start hos værten -> fjernes
  await host.$eval('#lobby-start', e => e.click()); await host.waitForTimeout(800);
  await pg.click('#ol-refresh'); await pg.waitForTimeout(400);
  const goneAfterStart = !(await pg.$(`.hm-ol-row[data-code="${hcode}"]`));
  // JOIN -> ?room=KODE
  await pg.click('.hm-ol-row[data-code="ZZZZ1"] .hm-ol-join'); await pg.waitForTimeout(800);
  const joinUrl = await pg.evaluate(() => location.search);
  const r = { empty, hcode, rows, hostRow: !!hostRow && /\d+\/\d+/.test(hostRow.text), noStale: !rows.some(x => x.code === 'OLD01'), fits, goneAfterStart, join: joinUrl.includes('room=ZZZZ1'), errs: errs.filter(e => !/peer|network|socket|ICE/i.test(e)) };
  out[w] = r; ok &&= r.empty && !!hcode && r.hostRow && r.noStale && r.fits && r.goneAfterStart && r.join && !r.errs.length;
  await ctx.close();
}
console.log(JSON.stringify(out)); await b.close(); process.exit(ok ? 0 : 1);
