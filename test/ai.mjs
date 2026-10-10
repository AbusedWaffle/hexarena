// AI-test: hele kampe headless med bots på alle pladser. Brug: node --experimental-default-type=module test/ai.mjs <seed> [blåDiff] [rødDiff]
import fs from 'node:fs';
const { createWorld, addPlayer, step, tileAt, isBlocking } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json'), cfg = rd('ai.json');
const seed = Number(process.argv[2] ?? 1), dBlue = process.argv[3] ?? 'normal', dRed = process.argv[4] ?? 'normal';
let s = seed; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const w = createWorld(map, classes), ai = createAI(w, cfg, seed);
const cls = { blue: ['Assault', 'Sniper', 'Engineer', 'Scout'], red: ['Assault', 'Sniper', 'Engineer', 'Support'] };
for (const team of ['blue', 'red']) for (const c of cls[team]) { const p = addPlayer(w, { team, cls: c }); ai.addBot(p.id, team === 'blue' ? dBlue : dRed); }
const errs = new Set(), states = {}, still = {}; let ticks = 0, kills = 0, firstKill = null; const t0 = performance.now();
while (!w.match.over && ticks < 20 * 400) {
  step(w, ai.frames()); ticks++;
  for (const e of w.events) if (e.type === 'kill') { kills++; firstKill ??= ticks / 20; }
  for (const d of ai.debug()) states[d.state] = (states[d.state] || 0) + 1;
  for (const p of w.players) {
    if (!p.alive) continue;
    if (isBlocking(tileAt(w, p.x, p.y))) errs.add(`${p.cls} i ${tileAt(w, p.x, p.y).type}`);
    const k = p.id, prev = still[k]; // længste periode uden bevægelse
    if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 2) { prev.n++; prev.max = Math.max(prev.max, prev.n); } else still[k] = { x: p.x, y: p.y, n: 0, max: prev?.max ?? 0 };
  }
}
const msPerTick = ((performance.now() - t0) / ticks).toFixed(3);
const longestStillSec = Math.max(...Object.values(still).map(v => v.max)) / 20;
console.log(JSON.stringify({ seed, dBlue, dRed, sec: ticks / 20, score: w.match.score, kills, firstKill, longestStillSec, msPerTick, states, errors: [...errs] }));
