// Integrations-smoke-test: 4 mod 4, alle klasser, tilfældige inputs, hele kampen headless.
import fs from 'node:fs';
const { createWorld, addPlayer, step, snapshot, tileAt, isBlocking } = await import('../sim/world.js');
const map = JSON.parse(fs.readFileSync(new URL('../data/map_paintyard_sq_01.json', import.meta.url)));
const classes = JSON.parse(fs.readFileSync(new URL('../data/classes.square.json', import.meta.url)));
let seed = Number(process.argv[2] ?? 1); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const w = createWorld(map, classes);
const cls = ['Assault', 'Sniper', 'Engineer', 'Scout'];
for (const team of ['blue', 'red']) for (let i = 0; i < 4; i++) addPlayer(w, { team, cls: i === 3 && team === 'red' ? 'Support' : cls[i] });
const errs = new Set(); let ticks = 0, kills = 0, hits = 0, cratesBroken = 0, maxEvents = 0;
const inputs = {}; for (const p of w.players) inputs[p.id] = { move: { x: 0, y: 0 }, aim: null, fire: false, ability: false, seq: 0 };
while (!w.match.over && ticks < 20 * 400) {
  for (const p of w.players) {
    const f = inputs[p.id]; f.seq++;
    if (ticks % 20 === 0) { const a = rnd() * 6.283; f.move = { x: Math.cos(a), y: Math.sin(a) }; }
    f.aim = rnd() < 0.5 ? null : { x: rnd() - 0.5, y: rnd() - 0.5 }; f.fire = rnd() < 0.3; f.ability = rnd() < 0.05;
  }
  step(w, inputs); ticks++;
  for (const e of w.events) { if (e.type === 'kill') kills++; if (e.type === 'hit') hits++; if (e.type === 'crateBroken') cratesBroken++; }
  maxEvents = Math.max(maxEvents, w.events.length);
  for (const p of w.players) {
    if (![p.x, p.y, p.hp].every(Number.isFinite)) errs.add(`NaN i ${p.id}`);
    if (p.alive && isBlocking(tileAt(w, p.x, p.y))) errs.add(`${p.cls} (${p.team}) står inde i en ${tileAt(w, p.x, p.y).type}`);
    if (!tileAt(w, p.x, p.y)) errs.add(`${p.cls} uden for banen`);
  }
}
const snapBytes = JSON.stringify(snapshot(w)).length;
console.log(JSON.stringify({ seed: process.argv[2] ?? 1, ticks, over: w.match.over, score: w.match.score, kills, hits, cratesBroken, maxEvents, snapBytes, errors: [...errs] }));
