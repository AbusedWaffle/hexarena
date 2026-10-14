// Invasion: 20 mod 20 på Slagmarken med 2 netværksklienter (loopback). Tjekker drab-point, kampslut, snapshot < 600 B pr. klient (kun nær kameraet), at klienten ser sig selv og nære spillere, og tick-tid.
import fs from 'node:fs';
const { createWorld, addPlayer, step, snapshot, startMatch } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const { createLoopbackPair } = await import('../net/transport.js');
const { createHostSession, createClientSession } = await import('../net/session.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = { ...rd('map_battlefield_sq_01.json'), id: 'battlefield_sq_01' }, classes = rd('classes.square.json'), aiCfg = rd('ai.json');
const md = rd('modes.json').modes.find(m => m.id === 'invasion');
classes._match.mode = 'invasion'; classes._match.modesData = { invasion: md }; classes._match.maxPerTeam = 20; classes._match.modeCfg = { timeSec: Number(process.env.SEC || 120) };
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; Math.random = rnd;
let tick = 0; const queue = []; const schedule = (_ms, fn) => queue.push({ at: tick + 2, fn });
const w = createWorld(map, classes), ai = createAI(w, aiCfg, 7), order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
for (const team of ['blue', 'red']) for (let i = 0; i < 20; i++) ai.addBot(addPlayer(w, { team, cls: order[i % 5], id: 'bot' + team[0].toUpperCase() + i }).id);
startMatch(w);
const lp = createLoopbackPair({ lossU: 0.05, rnd, schedule }), host = createHostSession(w, lp.host, { ai });
const clients = ['Scout', 'Assault'].map((c, i) => { const t = lp.addClient('c' + i); const s = createClientSession(t, { map, classes, cls: c }); t.connect(); return { t, s }; });
const errs = new Set(); let radMax = 0, maxB = 0, n = 0, sum = 0, ms = 0, steps = 0, seenMax = 0;
const send0 = lp.host.send.bind(lp.host);
lp.host.send = (k, ch, m) => { if (ch === 'u' && m.t === 'rad') radMax = Math.max(radMax, JSON.stringify(m).length);
  if (ch === 'u' && m.t === 's') { const b = JSON.stringify(m).length; maxB = Math.max(maxB, b); sum += b; n++; } send0(k, ch, m); };
while (!w.match.over && tick < 20 * 130) {
  tick++; for (const q of queue.splice(0)) if (q.at <= tick) q.fn(); else queue.push(q);
  clients.forEach((c, i) => { if (c.s.you) c.s.sendInput({ move: { x: Math.cos(tick / 30 + i), y: Math.sin(tick / 30 + i) }, aim: null, fire: rnd() < 0.2, ability: false, seq: tick }); });
  const t0 = performance.now(); step(w, { ...ai.frames(), ...host.frames() }); ms += performance.now() - t0; steps++;
  host.publish(snapshot(w));
  if (tick % 40 === 0) clients.forEach((c, i) => { const v = c.s.view?.(); if (!v || !c.s.you) return; seenMax = Math.max(seenMax, v.players.length);
    if (!v.players.some(p => p.id === 'me')) errs.add(`klient ${i} ser ikke sig selv`);
    const hp = w.players.find(p => p.id === c.s.you); const near = w.players.filter(p => p !== hp && Math.abs(p.x - hp.x) < 3 * 48 && Math.abs(p.y - hp.y) < 2 * 48).length;
    if (v.players.length - 1 < Math.min(near, 13)) errs.add(`klient ${i} mangler nære spillere (${v.players.length - 1}/${near}, død=${!hp.alive})`); });
}
clients.forEach((c, i) => { const R = c.s.radar; if (!R || R.length < 30) errs.add(`klient ${i}: radar ${R?.length}`); });
let radB = 0;
if (w.players.length !== 40) errs.add(`${w.players.length} spillere, forventede 40`);
if (!w.match.over) errs.add('kampen sluttede ikke'); if (w.match.score.blue + w.match.score.red === 0) errs.add('ingen drab-point');
if (maxB >= 600) errs.add(`snapshot ${maxB} B`); if (!n) errs.add('ingen snapshots sendt');
const out = { score: w.match.score, sec: tick / 20, maxBytes: maxB, radarBytes: radMax, avgBytes: Math.round(sum / (n || 1)), seenMax, msPerTick: +(ms / steps).toFixed(2), errors: [...errs] };
console.log(JSON.stringify(out)); process.exit(errs.size ? 1 : 0);
