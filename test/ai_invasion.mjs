// AI-ydelse: 40 botter (20 mod 20) Invasion på Slagmarken. Måler AI-tid (frames) og sim-tid (step) pr. tick, p99 og max, og tjekker at botter ikke sidder fast i vægge.
import fs from 'node:fs';
const { createWorld, addPlayer, step, startMatch, tileAt, isBlocking } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = { ...rd('map_battlefield_sq_01.json'), id: 'battlefield_sq_01' }, classes = rd('classes.square.json'), aiCfg = rd('ai.json');
const md = rd('modes.json').modes.find(m => m.id === 'invasion');
classes._match.mode = 'invasion'; classes._match.modesData = { invasion: md }; classes._match.maxPerTeam = 20; classes._match.modeCfg = { timeSec: Number(process.env.SEC || 180) };
let s = 5; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const w = createWorld(map, classes), ai = createAI(w, aiCfg, 5), order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
for (const team of ['blue', 'red']) for (let i = 0; i < 20; i++) ai.addBot(addPlayer(w, { team, cls: order[i % 5] }).id);
startMatch(w);
const aiT = [], simT = [], errs = new Set(); let ticks = 0, kills = 0; const still = {};
while (!w.match.over && ticks < 20 * 200) {
  let t0 = performance.now(); const f = ai.frames(); const t1 = performance.now(); step(w, f); const t2 = performance.now();
  aiT.push(t1 - t0); simT.push(t2 - t1); ticks++;
  for (const e of w.events) if (e.type === 'kill') kills++;
  for (const p of w.players) { if (!p.alive) { still[p.id] = null; continue; } if (isBlocking(tileAt(w, p.x, p.y))) errs.add(`${p.cls} i væg`);
    const v = still[p.id]; if (v && Math.hypot(v.x - p.x, v.y - p.y) < 2) { v.n++; v.max = Math.max(v.max, v.n); } else still[p.id] = { x: p.x, y: p.y, n: 0, max: v?.max ?? 0 }; }
}
const st = a => { const b = a.slice(200).sort((x, y) => x - y); return { avg: +(b.reduce((x, y) => x + y, 0) / b.length).toFixed(3), p99: +b[Math.floor(b.length * .99)].toFixed(3), max: +b[b.length - 1].toFixed(2) }; };
const stuck = Math.max(0, ...Object.values(still).filter(Boolean).map(v => v.max)) / 20;
if (!kills) errs.add('ingen drab'); if (w.players.length !== 40) errs.add('ikke 40 botter');
const out = { sec: ticks / 20, score: w.match.score, kills, ai: st(aiT), sim: st(simT), longestStillSec: stuck, errors: [...errs] };
console.log(JSON.stringify(out)); process.exit(errs.size ? 1 : 0);
