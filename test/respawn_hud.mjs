// Respawn-HUD og KC-dash-feedback (render/hud.js) ved 844×390 og 1280×720:
// tdm: død Scout viser 'RESPAWN OM N' (N fra respawnSecByClass/respawnSec i sim), tæller ned; hq-blokering → 'RESPAWN SLÅET FRA';
// knockout → 'Du er ude – ser med'; tag-event med dash:true → diamant + '+1' / 'NÆGTET'. Skærmbilleder SHOT_PREFIX_*.png.
const { chromium } = await import('playwright').catch(() => import('playwright-core'));
const PORT = process.env.PORT || 8090, P = process.env.SHOT_PREFIX || '/tmp/respawn_hud';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [], res = {};
const kill = (pg) => pg.evaluate(() => { const w = __arena.world, p = w.players.find(q => q.id === 'me'); p.hp = 0; p.alive = false; p.respawnLeft = w.match.cfg?.respawnSecByClass?.[p.cls] ?? w.match.cfg?.respawnSec ?? 3; return p.respawnLeft; });
const center = (pg) => pg.evaluate(() => __arena.hudUI.modeTexts().center);
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 1000, deviceScaleFactor: w < 1000 ? 2 : 1 });
  const ok = {};
  // TDM som Scout
  let pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(`${w}: ` + e.message));
  await pg.goto(`http://localhost:${PORT}/?mode=tdm&map=paintyard_sq_01&lobby=0&cls=Scout&red=0&blue=0`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 });
  // ?lobby=0 tæller som lobby i game.js (QS.has('lobby')), så kampen startes eksplicit
  await pg.evaluate(() => { globalThis.__lobbyStarted = true; dispatchEvent(new CustomEvent('hexarena:lobby-start')); }); await pg.waitForTimeout(800);
  const sec = await kill(pg); await pg.waitForTimeout(250);
  const t1 = await center(pg); ok.respawnText = t1 === `RESPAWN OM ${Math.ceil(sec - 0.25)}` || t1 === `RESPAWN OM ${Math.ceil(sec)}`;
  ok.scoutSec = sec === (await pg.evaluate(() => __arena.world.match.cfg?.respawnSecByClass?.Scout ?? __arena.world.match.cfg?.respawnSec));
  // tæl ned: vent (max 3 s, headless kan være langsom) til teksten skifter til et lavere tal
  await pg.waitForFunction((t1) => { const c = __arena.hudUI.modeTexts().center; return c !== t1; }, t1, { timeout: 3000, polling: 50 }).catch(() => {}); const t2 = await center(pg);
  await pg.screenshot({ path: `${P}_respawn_${w}.png` }); ok.countsDown = /^RESPAWN OM \d$/.test(t2) && +t2.slice(-1) === +t1.slice(-1) - 1; if (!ok.countsDown) console.error('countdown:', t1, '→', t2, sec);
  await pg.evaluate(() => { __arena.world.match.respawnBlocked = __arena.world.players.find(q => q.id === 'me').team; }); await pg.waitForTimeout(250);
  ok.blocked = (await center(pg)) === 'RESPAWN SLÅET FRA';
  await pg.evaluate(() => { __arena.world.match.respawnBlocked = null; });
  await pg.waitForTimeout(3000); ok.respawned = await pg.evaluate(() => __arena.cur.players.find(q => q.id === 'me').alive) && (await center(pg)) === '';
  // KC-dash: tag-events
  const tag = (confirmed) => pg.evaluate((confirmed) => { const me = __arena.cur.players.find(q => q.id === 'me'); __arena.hudUI.onEvent({ type: 'tag', dash: true, id: 'me', team: me.team, confirmed, x: me.x + 140, y: me.y - 40 }, __arena.cur); }, confirmed);
  await tag(true); await pg.waitForTimeout(120); ok.flying = await pg.evaluate(() => __arena.hudUI.modeTexts().tagFx === 1);
  await pg.screenshot({ path: `${P}_tagfly_${w}.png` });
  await pg.waitForTimeout(250); ok.plusOne = (await pg.evaluate(() => __arena.hudUI.modeTexts().toasts)).includes('+1');
  await pg.screenshot({ path: `${P}_tag_${w}.png` });
  await tag(false); await pg.waitForTimeout(350); ok.denied = (await pg.evaluate(() => __arena.hudUI.modeTexts().toasts)).includes('NÆGTET');
  await pg.waitForTimeout(1500); ok.cleared = await pg.evaluate(() => __arena.hudUI.modeTexts().tagFx === 0);
  await pg.close();
  // knockout beholder 'Du er ude – ser med'
  pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(`${w} ko: ` + e.message));
  await pg.goto(`http://localhost:${PORT}/?mode=knockout&lobby=0&cls=Assault&red=1&blue=1`); await pg.waitForFunction(() => globalThis.__arena?.cur, null, { timeout: 30000 }); await pg.evaluate(() => { globalThis.__lobbyStarted = true; dispatchEvent(new CustomEvent('hexarena:lobby-start')); }); await pg.waitForFunction(() => __arena.cur.match.roundIntroLeft === 0, null, { timeout: 15000 }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const p = __arena.world.players.find(q => q.id === 'me'); p.hp = 0; p.alive = false; p.respawnLeft = Infinity; }); await pg.waitForTimeout(250);
  const kt = await center(pg); ok.knockout = kt === 'Du er ude – ser med'; if (!ok.knockout) console.error('knockout center:', JSON.stringify(kt));
  await pg.close(); await ctx.close();
  res[w] = ok;
}
console.log(JSON.stringify({ res, errs })); await b.close();
process.exit(Object.values(res).every(o => Object.values(o).every(Boolean)) && !errs.length ? 0 : 1);
