// Knockout-runder headless med bots: tjekker roundStart/roundEnd, nulstilling til egne spawns, ingen respawn i runden og kampslut ved roundsToWin.
import fs from 'node:fs';
const { createWorld, addPlayer, step, snapshot } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js'); const { tileToPixel } = await import('../sim/grid.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json'), aiCfg = rd('ai.json');
let seed = Number(process.argv[2] ?? 1); Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const w = createWorld(map, classes), ai = createAI(w, aiCfg, 3), order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
for (const team of ['blue', 'red']) for (let i = 0; i < 4; i++) ai.addBot(addPlayer(w, { team, cls: order[(i + (team === 'red')) % 5] }).id, process.argv[3] || 'normal');
const errs = new Set(), rounds = []; let ticks = 0, introTicksMoved = 0;
while (!w.match.over && ticks < 20 * 60 * 10) {
  const before = w.players.map(p => [p.x, p.y]), intro = w.match.roundIntroLeft > 0;
  step(w, ai.frames()); ticks++;
  if (intro && w.match.roundIntroLeft > 0) w.players.forEach((p, i) => { if (p.x !== before[i][0] || p.y !== before[i][1]) introTicksMoved++; });
  for (const e of w.events) {
    if (e.type === 'roundEnd') rounds.push({ round: e.round, winner: e.winner, reason: e.reason, sec: +(ticks / 20).toFixed(1), score: `${e.score.blue}-${e.score.red}` });
    if (e.type === 'respawn' && ticks > 1) errs.add('respawn i knockout-runde');
    if (e.type === 'roundStart' && ticks > 1) {
      for (const team of ['blue', 'red']) w.players.filter(p => p.team === team).forEach((p, i) => { const s = map.spawns[team][i], px = tileToPixel(s.x, s.y); if (Math.hypot(p.x - px.x, p.y - px.y) > 1 || p.hp !== p.maxHp || !p.alive) errs.add(`runde ${e.round}: ${p.id} ikke nulstillet til eget spawn`); });
      const crates = [...w.tiles.values()].filter(t => t.type === 'crate').length, orig = map.tiles.filter(t => t.type === 'crate').length;
      if (crates !== orig) errs.add(`runde ${e.round}: ${crates} kasser, forventede ${orig}`);
    }
  }
}
if (introTicksMoved) errs.add(`${introTicksMoved} bevægelser under nedtælling`);
const s = snapshot(w).match;
if (!w.match.over) errs.add('kampen sluttede ikke');
if (Math.max(s.score.blue, s.score.red) !== classes._match.roundsToWin) errs.add('slutscore ≠ roundsToWin');
console.log(JSON.stringify({ seed: process.argv[2] ?? 1, sec: +(ticks / 20).toFixed(1), final: s, rounds, errors: [...errs] }));
