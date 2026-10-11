// Taktik-test: en passiv "menneske"-spiller (blå) gemmer sig ved egen spawn uden at skyde, mod 4 røde bots.
// Måler om bots jager uden viden (afstand til spilleren over tid) og hvor mange bots der jager samme mål ad gangen.
// Brug: node --experimental-default-type=module test/ai_tactics.mjs [seed] [diff]
import fs from 'node:fs';
const { createWorld, addPlayer, step } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const classes = rd('classes.square.json'); classes._match = { ...classes._match, mode: 'tdm', durationSec: 60 };
const seed = Number(process.argv[2] ?? 1), diff = process.argv[3] ?? 'normal';
let s = seed; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const w = createWorld(rd('map_paintyard_sq_01.json'), classes), ai = createAI(w, rd('ai.json'), seed);
const me = addPlayer(w, { team: 'blue', cls: 'Assault', id: 'me' });
for (const c of ['Assault', 'Sniper', 'Engineer', 'Scout']) ai.addBot(addPlayer(w, { team: 'red', cls: c }).id, diff);
const avgDist = () => { const r = w.players.filter(p => p.team === 'red' && p.alive); return +(r.reduce((a, p) => a + Math.hypot(p.x - me.x, p.y - me.y), 0) / r.length / 48).toFixed(1); };
const out = { seed, diff, distAt: {}, maxHuntersOnMe: 0, maxShootersOnMe: 0, firstContactSec: null };
for (let t = 0; t < 20 * 40; t++) {
  const f = ai.frames(); f.me = { move: { x: 0, y: 0 }, aim: null, fire: false, ability: false }; step(w, f);
  me.hp = me.maxHp; // spilleren dør ikke, så vi kan se adfærden over tid
  // jægere = bevæger sig efter spilleren (højst maxBotsPerTarget); skytter = skyder på spilleren fra hvor de står (fx inden for 5 tiles)
  const dbg = ai.debug(), hunters = dbg.filter(d => d.hunt === 'me' || (d.target === 'me' && (d.state === 'engage' || d.state === 'approach') && !d.noChase)).length;
  const onMe = dbg.filter(d => d.target === 'me').length;
  out.maxHuntersOnMe = Math.max(out.maxHuntersOnMe, hunters); out.maxShootersOnMe = Math.max(out.maxShootersOnMe, onMe);
  if (onMe && out.firstContactSec == null) out.firstContactSec = t / 20;
  if ((t + 1) % 100 === 0) out.distAt[(t + 1) / 20 + 's'] = avgDist();
}
console.log(JSON.stringify(out));
