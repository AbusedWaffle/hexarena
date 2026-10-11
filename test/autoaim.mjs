// Auto-aim: træfprocent mod et mål, der står stille / løber på tværs, og at markeringen (autoTargetId) er det mål, skuddet går efter.
import fs from 'node:fs';
const W = await import('../sim/world.js'); const { TILE_PX: U, tileToPixel } = await import('../sim/grid.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json');
let seed = 5; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
classes._match.mode = 'tdm';
const res = {};
for (const cls of ['Assault', 'Scout', 'Support', 'Sniper', 'Engineer']) for (const moving of [false, true]) {
  let shots = 0, hits = 0, markOk = 0, marks = 0;
  for (let trial = 0; trial < 20; trial++) {
    const w = W.createWorld(map, classes); const a = W.addPlayer(w, { team: 'blue', cls }), b = W.addPlayer(w, { team: 'red', cls: 'Engineer' });
    const pa = tileToPixel(3, 14), pb = tileToPixel(8, 13); Object.assign(a, { x: pa.x, y: pa.y, spawnShieldLeft: 0 }); Object.assign(b, { x: pb.x, y: pb.y, spawnShieldLeft: 0, hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 60; i++) {
      const dirY = Math.floor(i / 15) % 2 ? -1 : 1;
      W.step(w, { [a.id]: { move: { x: 0, y: 0 }, aim: null, fire: i % 25 === 0, ability: false, seq: i }, [b.id]: { move: { x: 0, y: moving ? dirY : 0 }, aim: null, fire: false, ability: false, seq: i } });
      for (const e of w.events) { if (e.type === 'shot' && e.id === a.id) shots += e.hitscan ? 1 : classes[cls].weapon.pellets; if (e.type === 'hit' && e.by === a.id) hits++; }
      marks++; if (a.autoTargetId === b.id) markOk++;
    }
  }
  res[cls + (moving ? ' løber' : ' står')] = { træf: Math.round(100 * hits / Math.max(1, shots)) + '%', markering: Math.round(100 * markOk / marks) + '%' };
}
console.log(JSON.stringify(res, null, 0));
