// Skifter bane midt i en bot-kamp (som lobbyen gør) og tjekker at poster ligger på den nye bane og botterne får kontakt.
import fs from 'node:fs';
const { createWorld, setMap, addPlayer, step, tileAt, isBlocking } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const classes = rd('classes.square.json'), cfg = rd('ai.json'), maps = rd('maps.json').maps;
let s = 7; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
const w = createWorld(rd('map_paintyard_sq_01.json'), classes), ai = createAI(w, cfg, 7);
for (const team of ['blue', 'red']) for (const c of ['Assault', 'Sniper', 'Engineer', team === 'blue' ? 'Scout' : 'Support']) ai.addBot(addPlayer(w, { team, cls: c }).id, 'normal');
let fail = 0;
for (const m of maps) {
  setMap(w, rd(m.file.replace('data/', ''))); let kills = 0;
  for (let t = 0; t < 20 * (m.size === "large" ? 70 : 40); t++) { step(w, ai.frames()); for (const e of w.events) if (e.type === 'kill') kills++; }
  const bad = ai.debug().filter(d => !d.post || d.post.x >= w.map.width || d.post.y >= w.map.height || isBlocking(w.tiles.get(d.post.x + ',' + d.post.y)));
  const ok = !bad.length && kills > 0; if (!ok) fail++;
  console.log(m.id, ok ? 'OK' : 'FEJL', { kills, badPosts: bad.length });
}
process.exit(fail ? 1 : 0);
