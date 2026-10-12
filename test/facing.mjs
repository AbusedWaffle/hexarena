// Figurens retning: gåretning når man går, sigteretning ved skud (holdes facingHoldSec), blød drejning (turnRateDeg/s), og auto-aim-tap vender mod målet.
import fs from 'node:fs';
const W = await import('../sim/world.js'); const { tileToPixel } = await import('../sim/grid.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = rd('map_paintyard_sq_01.json'), classes = rd('classes.square.json'); classes._match.mode = 'tdm';
const w = W.createWorld(map, classes), a = W.addPlayer(w, { team: 'blue', cls: 'Assault' }), b = W.addPlayer(w, { team: 'red', cls: 'Engineer' });
const pa = tileToPixel(3, 14), pb = tileToPixel(8, 13); Object.assign(a, { x: pa.x, y: pa.y, spawnShieldLeft: 0 }); Object.assign(b, { x: pb.x, y: pb.y, hp: 1e6, maxHp: 1e6 });
const d = (r) => Math.round(r * 180 / Math.PI); let seq = 0; const out = {};
const run = (n, inp) => { for (let i = 0; i < n; i++) W.step(w, { [a.id]: { move: { x: 0, y: 0 }, aim: null, fire: false, ability: false, seq: seq++, ...inp }, [b.id]: { seq: seq } }); };
run(3, { move: { x: 0, y: 1 } }); out.gårNed = d(a.facing);
run(1, { move: { x: 0, y: 1 }, fire: true }); out.målVinkel = d(Math.atan2(b.y - a.y, b.x - a.x)); out.tapEfter1tick = d(a.facing); run(4, { move: { x: 0, y: 1 } }); out.tapMod = d(a.facing);
run(2, { move: { x: 0, y: 1 } }); out.holdt0_35s = d(a.facing); run(12, { move: { x: 0, y: 1 } }); out.tilbageEfter0_95s = d(a.facing);
run(1, { move: { x: 0, y: -1 } }); out.vendEfter1tick = d(a.facing);
console.log(JSON.stringify(out));
const near = (x, y, t) => Math.abs(((x - y + 540) % 360) - 180) <= t;
const ok = near(out.gårNed, 90, 2) && near(out.tapMod, out.målVinkel, 15) && near(out.holdt0_35s, out.målVinkel, 15) && near(out.tilbageEfter0_95s, 90, 2) && near(out.vendEfter1tick, 90, 37) && !near(out.vendEfter1tick, 90, 30);
if (!ok) { console.error('FEJL'); process.exit(1); }
