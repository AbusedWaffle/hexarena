// Måler hvor "rystende" bots bevæger sig: gennemsnitlig vinkelændring i move pr. sekund og antal skarpe vendinger (>120° på ét tick) pr. minut.
// Brug: node --experimental-default-type=module test/ai_smooth.mjs [seed] [diff]
import fs from 'node:fs';
const { createWorld, addPlayer, step } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json'), cfg = rd('ai.json');
const seed = Number(process.argv[2] ?? 1), diff = process.argv[3] ?? 'normal';
let s = seed; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const w = createWorld(map, classes), ai = createAI(w, cfg, seed);
for (const team of ['blue', 'red']) for (const c of ['Assault', 'Sniper', 'Engineer', 'Scout']) ai.addBot(addPlayer(w, { team, cls: c }).id, diff);
const prev = {}; let turn = 0, movingTicks = 0, flips = 0, ticks = 0;
while (!w.match.over && ticks < 20 * 300) {
  const f = ai.frames(); step(w, f); ticks++;
  for (const id in f) {
    const m = f[id].move, l = Math.hypot(m.x, m.y), p = prev[id];
    if (l > 0.2 && p) { let d = Math.abs(Math.atan2(m.y, m.x) - Math.atan2(p.y, p.x)); if (d > Math.PI) d = 2 * Math.PI - d; turn += d; movingTicks++; if (d > 2.1) flips++; }
    prev[id] = l > 0.2 ? m : null;
  }
}
const sec = movingTicks / 20;
console.log(JSON.stringify({ seed, diff, degPerSec: Math.round(turn * 180 / Math.PI / sec), sharpFlipsPerMin: +(flips / sec * 60).toFixed(1), score: w.match.score }));
