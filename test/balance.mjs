// Balance-test: mange 4v4-kampe kun med bots og tilfældige hold. Måler kills, deaths og skade pr. klasse.
// Brug: node --experimental-default-type=module test/balance.mjs [antalKampe] [diff]
import fs from 'node:fs';
const { createWorld, addPlayer, step } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_' + (process.env.MAP || 'paintyard_sq_01') + '.json'), classes = rd('classes.square.json'), cfg = rd('ai.json');
const N = Number(process.argv[2] ?? 40), diff = process.argv[3] ?? 'normal';
const CL = ['Assault', 'Sniper', 'Engineer', 'Scout', 'Support'];
const st = Object.fromEntries(CL.map(c => [c, { games: 0, wins: 0, kills: 0, deaths: 0, dmg: 0, heal: 0 }]));
for (let g = 1; g <= N; g++) {
  let s = g * 7919; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = createWorld(map, classes), ai = createAI(w, cfg, g), byId = {};
  for (const team of ['blue', 'red']) for (let i = 0; i < 4; i++) {
    const c = CL[Math.floor(Math.random() * CL.length)]; const p = addPlayer(w, { team, cls: c }); byId[p.id] = { c, team }; ai.addBot(p.id, diff);
  }
  let t = 0;
  while (!w.match.over && t < 20 * 400) { step(w, ai.frames()); t++;
    for (const e of w.events) {
      if (e.type === 'kill') { if (byId[e.by]) st[byId[e.by].c].kills++; st[byId[e.id].c].deaths++; }
      if (e.type === 'hit' && byId[e.by] && byId[e.by].team !== byId[e.id]?.team) st[byId[e.by].c].dmg += e.damage;
    }
  }
  const sc = w.match.score, win = sc.blue > sc.red ? 'blue' : sc.red > sc.blue ? 'red' : null;
  for (const id in byId) { const b = byId[id]; st[b.c].games++; if (b.team === win) st[b.c].wins++; }
}
const out = CL.map(c => { const x = st[c]; return { cls: c, picks: x.games, winPct: +(100 * x.wins / x.games).toFixed(0), kd: +(x.kills / Math.max(1, x.deaths)).toFixed(2), killsPerGame: +(x.kills / x.games).toFixed(1), dmgPerGame: Math.round(x.dmg / x.games) }; });
console.table(out);
