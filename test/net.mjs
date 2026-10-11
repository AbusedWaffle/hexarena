// Netværkstest headless: host + 2 klienter over loopback med latens og pakketab på den unordnede kanal.
// node --experimental-default-type=module test/net.mjs [seed] [latencyTicks] [loss]
import fs from 'node:fs';
const { createWorld, addPlayer, step, snapshot } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const { createLoopbackPair } = await import('../net/transport.js');
const { createHostSession, createClientSession } = await import('../net/session.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json'), aiCfg = rd('ai.json');
let seed = Number(process.argv[2] ?? 1); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; Math.random = rnd;
const LAT = Number(process.argv[3] ?? 2), LOSS = Number(process.argv[4] ?? 0.1);
let tick = 0; const queue = []; const schedule = (_ms, fn) => queue.push({ at: tick + LAT, fn });
const w = createWorld(map, classes), ai = createAI(w, aiCfg, 7);
addPlayer(w, { team: 'blue', cls: 'Assault', id: 'me' });
const order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
for (let i = 0; i < 3; i++) ai.addBot(addPlayer(w, { team: 'blue', cls: order[i + 1], id: 'botB' + i }).id);
for (let i = 0; i < 4; i++) ai.addBot(addPlayer(w, { team: 'red', cls: order[i], id: 'botR' + i }).id);
const lp = createLoopbackPair({ lossU: LOSS, rnd, schedule });
const host = createHostSession(w, lp.host, { ai });
const cls = ['Scout', 'Engineer'], clients = cls.map((c, i) => { const t = lp.addClient('c' + i); const s = createClientSession(t, { map, classes, cls: c }); t.connect(); return { t, s, c }; });
const errs = new Set(); const errsList = []; let maxBytes = 0, sumBytes = 0, nSnaps = 0, evCount = [0, 0], hostEv = 0, maxPredErr = 0;
const origBroadcast = lp.host.broadcast.bind(lp.host);
lp.host.broadcast = (ch, m) => { if (ch === 'u') { const b = JSON.stringify(m).length; maxBytes = Math.max(maxBytes, b); sumBytes += b; nSnaps++; } origBroadcast(ch, m); };
while (!w.match.over && tick < 20 * 200) {
  tick++;
  for (const q of queue.splice(0).filter(q => { if (q.at <= tick) { q.fn(); return false; } return true; })) queue.push(q);
  clients.forEach((c, i) => {
    if (!c.s.ready && !c.s.you) return;
    const a = Math.floor(tick / 15) * 1.7 + i;
    c.s.sendInput({ move: { x: Math.cos(a), y: Math.sin(a) }, aim: rnd() < 0.5 ? null : { x: rnd() - 0.5, y: rnd() - 0.5 }, fire: rnd() < 0.2, ability: rnd() < 0.03, seq: tick });
    const v = c.s.view(); if (v) evCount[i] += v.events.length;
  });
  step(w, { ...ai.frames(), ...host.frames() }); hostEv += w.events.length;
  host.publish(snapshot(w));
  // prediction-fejl: klientens forudsagte position vs. hostens rigtige (forventet ≈ latens × fart)
  clients.forEach((c) => { const id = c.s.you; if (!id) return; const hp = w.players.find(p => p.id === id), me = c.s.world.players.find(p => p.id === 'me'); if (hp && me && hp.alive && me.alive) { const e = Math.hypot(hp.x - me.x, hp.y - me.y); maxPredErr = Math.max(maxPredErr, e); errsList.push(e); } });
}
for (let k = 0; k < LAT + 2; k++) { tick++; for (const q of queue.splice(0)) if (q.at <= tick) q.fn(); else queue.push(q); }
clients.forEach((c, i) => {
  if (!c.s.you) errs.add(`klient ${i} fik ingen welcome`);
  const hp = w.players.find(p => p.id === c.s.you); if (hp && hp.cls !== c.c) errs.add(`klient ${i} har klasse ${hp.cls}, ønskede ${c.c}`);
  if (ai.bots.has(c.s.you)) errs.add(`klient ${i}s plads styres stadig af AI`);
  let diff = 0; for (const t of w.tiles.values()) { const ct = c.s.world.tiles.get(t.x + ',' + t.y); if ((t.type === 'crate') !== (ct.type === 'crate')) diff++; }
  if (diff) errs.add(`klient ${i}: ${diff} kasse-tiles ude af sync`);
  const v = c.s.view(); if (!v || v.match.score.blue !== w.match.score.blue || v.match.score.red !== w.match.score.red) errs.add(`klient ${i}: score ude af sync`);
});
if (maxBytes > 600) errs.add(`snapshot ${maxBytes} B > 600 B`);
console.log(JSON.stringify({ seed: process.argv[2] ?? 1, latencyTicks: LAT, lossU: LOSS, ticks: tick, over: w.match.over, score: w.match.score,
  snapBytesMax: maxBytes, snapBytesAvg: Math.round(sumBytes / nSnaps), kbpsPerClient: Math.round(sumBytes / nSnaps * 20 * 8 / 1000),
  eventsHost: hostEv, eventsClients: evCount, maxPredErrPx: Math.round(maxPredErr), p95PredErrPx: Math.round(errsList.sort((a, b) => a - b)[Math.floor(errsList.length * 0.95)]), medPredErrPx: Math.round(errsList[Math.floor(errsList.length / 2)]), clients: clients.map(c => ({ you: c.s.you, cls: c.c })), errors: [...errs] }));
