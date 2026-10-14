// Spiltilstande (tdm, kc, dom, hp, hq): regler i sim med styrede spillere, bot-kamp til slut, og codec (< 600 B, objektiver/brikker/tilstand rundtur).
import fs from 'node:fs';
const { createWorld, addPlayer, step, snapshot, startMatch } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js'); const { TILE_PX: U } = await import('../sim/grid.js');
const { encodeSnap, decodeSnap, rosterOf } = await import('../net/codec.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const maps = rd('maps.json'), errs = [], ok = (c, msg) => { if (!c) errs.push(msg); };
let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'];
function mk(mode, mapFile = 'map_paintyard_sq_01.json', cfg = {}) {
  const map = rd(mapFile), classes = rd('classes.square.json'); classes._match.mode = mode; classes._match.modeCfg = cfg;
  const w = createWorld({ ...map, id: mapFile }, classes), ai = createAI(w, rd('ai.json'), 3);
  for (const team of ['blue', 'red']) for (let i = 0; i < 4; i++) ai.addBot(addPlayer(w, { team, cls: order[(i + (team === 'red')) % 5] }).id, 'normal');
  startMatch(w); return { w, ai, map: { ...map, id: mapFile } };
}
const idle = (w) => Object.fromEntries(w.players.map(p => [p.id, { move: { x: 0, y: 0 }, aim: null, fire: false, ability: false }]));
const park = (w, team, x, y) => w.players.filter(p => p.team === team).forEach(p => { if (p.alive) { p.x = x; p.y = y; } });
const away = (w) => { for (const p of w.players) { p.x = -999; p.y = -999; } }; // uden for alle zoner, ingen kollision med vægge (vi bevæger ikke)
const kill = (w, p) => { p.hp = 0; p.alive = false; };
const run = (w, sec, f) => { for (let i = 0; i < sec * 20; i++) { f?.(); step(w, idle(w)); } };

// TDM: drab giver point, slut ved scoreTarget
{ const { w } = mk('tdm', undefined, { scoreTarget: 3 }); ok(w.match.target === 3 && w.match.mode === 'tdm', 'tdm: target');
  const r = w.players.filter(p => p.team === 'red'); for (const v of r.slice(0, 3)) { w.match.score.blue++; } run(w, 0.1); ok(w.match.over, 'tdm: slutter ikke ved target'); }
// Kill Confirmed: drab via damage -> brik; fjende samler = point, eget hold = nægtet
{ const { w } = mk('kc'); const { onKillMode } = await import('../sim/modes.js');
  const v = w.players.find(p => p.team === 'red'), b = w.players.find(p => p.team === 'blue');
  onKillMode(w, v, 'blue'); ok(w.match.tags.length === 1 && w.match.score.blue === 0, 'kc: drab giver brik, ikke point');
  const t = w.match.tags[0]; for (const p of w.players) { p.x = -999; p.y = -999; } b.x = t.x; b.y = t.y; run(w, 0.1);
  ok(w.match.score.blue === 1 && !w.match.tags.length, 'kc: blå samler rød brik = 1 point');
  onKillMode(w, b, 'red'); const t2 = w.match.tags[0]; for (const p of w.players) { p.x = -999; p.y = -999; } const b2 = w.players.filter(p => p.team === 'blue')[1]; b2.x = t2.x; b2.y = t2.y; run(w, 0.1);
  ok(w.match.score.red === 0 && !w.match.tags.length, 'kc: blå nægter egen brik');
  onKillMode(w, v, 'blue'); away(w); run(w, 31); ok(!w.match.tags.length, 'kc: brik udløber'); }
// Domination: 3 zoner; indtag, neutralisering, 1 point/s pr. zone
{ const { w } = mk('dom'); const Z = w.match.objectives; ok(Z.length === 3 && Z.map(z => z.id).join('') === 'ABC', 'dom: A/B/C');
  const c = (z) => ({ x: (z.x + z.w / 2) * U, y: (z.y + z.h / 2) * U });
  away(w); run(w, 6, () => { away(w); park(w, 'blue', c(Z[0]).x, c(Z[0]).y); });
  ok(Z[0].owner === 'blue', 'dom: blå indtager A'); const s0 = w.match.score.blue; away(w); run(w, 10, () => away(w));
  ok(Math.abs(w.match.score.blue - s0 - 10) <= 1, `dom: 1 pt/s (fik ${w.match.score.blue - s0})`);
  run(w, 3, () => { away(w); park(w, 'blue', c(Z[1]).x, c(Z[1]).y); park(w, 'red', c(Z[1]).x, c(Z[1]).y); }); ok(!Z[1].owner, 'dom: omstridt zone indtages ikke');
  run(w, 12, () => { away(w); park(w, 'red', c(Z[0]).x, c(Z[0]).y); }); ok(Z[0].owner === 'red', 'dom: rød overtager A');
  const sn = snapshot(w); ok(sn.objectives.length === 3 && sn.objectives[0].owner === 'red', 'dom: snapshot'); }
// Hardpoint: point kun uden fjender i zonen, flytter hvert rotateSec
{ const { w } = mk('hp', undefined, { rotateSec: 5 }); const Z = w.match.objectives, z0 = Z[0], c = { x: (z0.x + 1.5) * U, y: (z0.y + 1.5) * U };
  away(w); run(w, 3, () => { away(w); park(w, 'red', c.x, c.y); }); ok(w.match.score.red >= 2, 'hp: rød scorer i zonen');
  const s = w.match.score.red; run(w, 1.5, () => { away(w); park(w, 'red', c.x, c.y); park(w, 'blue', c.x, c.y); }); ok(w.match.score.red === s, 'hp: omstridt giver ingen point');
  away(w); run(w, 1, () => away(w)); ok(w.match.active === 1 && snapshot(w).objectives[1].active, `hp: zonen flyttede (active=${w.match.active})`); }
// Headquarters: indtag -> ejeren kan ikke respawne; hele holdet ude -> HQ falder og flytter
{ const { w } = mk('hq', undefined, { capSec: 2, moveDelaySec: 2 }); const z = w.match.objectives[0], c = { x: (z.x + 1.5) * U, y: (z.y + 1.5) * U };
  away(w); run(w, 3, () => { away(w); park(w, 'blue', c.x, c.y); }); ok(z.owner === 'blue' && w.match.respawnBlocked === 'blue', 'hq: blå ejer, respawn blokeret');
  const b = w.players.filter(p => p.team === 'blue'); kill(w, b[0]); b[0].respawnLeft = 3; run(w, 5, () => { for (const p of w.players) if (p.alive) { p.x = -999; p.y = -999; } }); ok(!b[0].alive, 'hq: blå respawner ikke');
  for (const p of b) { kill(w, p); p.respawnLeft = 3; } run(w, 0.2, () => away(w)); ok(!z.owner && !w.match.respawnBlocked, 'hq: falder når holdet er ude');
  run(w, 3, () => away(w)); ok(w.match.active === 1, 'hq: flytter'); ok(b.every(p => p.alive), 'hq: respawn igen efter fald'); }
// data/modes.json flettes ind; respawnSecByClass; scoutTagDash
{ const md = rd('modes.json'); const classes = rd('classes.square.json'); const map = rd('map_paintyard_sq_01.json');
  classes._match.mode = 'kc'; classes._match.modesData = { kc: { ...md.modes.find(x => x.id === 'kc'), respawnSecByClass: { Scout: 2 }, scoutTagDash: true } };
  const w = createWorld(map, classes); const s = addPlayer(w, { team: 'blue', cls: 'Scout' }), r = addPlayer(w, { team: 'red', cls: 'Assault' }); startMatch(w);
  const { damagePlayer } = await import('../sim/world.js'); const { onKillMode, dashTags } = await import('../sim/modes.js');
  ok(w.match.target === md.modes.find(x => x.id === 'kc').scoreTarget, 'modes.json: scoreTarget');
  if (damagePlayer) { s.invulnLeft = 0; s.spawnShieldLeft = 0; damagePlayer(w, r.id, s, 9999); ok(Math.abs(s.respawnLeft - 2) < 0.01, `respawnSecByClass: Scout ${s.respawnLeft}`); }
  w.match.tags = [{ id: 99, x: 300, y: 100, team: 'red', left: 30 }]; s.alive = true; const from = { x: 100, y: 100 }; s.x = 500; s.y = 100; dashTags(w, s, from);
  ok(!w.match.tags.length && w.match.score.blue === 1, 'scoutTagDash: brik samlet på strækningen'); }
// Bot-kampe til slut + codec på alle tilstande og baner
for (const mode of ['tdm', 'kc', 'dom', 'hp', 'hq']) for (const mi of maps.maps ?? maps) {
  const { w, ai, map } = mk(mode, mi.file.split('/').pop(), { timeSec: 40 }); let maxB = 0, ticks = 0;
  const roster = rosterOf(w);
  while (!w.match.over && ticks < 20 * 45) { step(w, ai.frames()); ticks++;
    if (ticks % 20 === 0) { const sn = snapshot(w), enc = encodeSnap(sn, roster), bytes = JSON.stringify(enc).length; maxB = Math.max(maxB, bytes);
      const d = decodeSnap(JSON.parse(JSON.stringify(enc)), roster, x => x, map);
      ok(d.match.mode === mode && d.match.target === sn.match.target, `${mode}: codec mode/target`);
      ok(d.objectives.length === sn.objectives.length && d.objectives.every((o, i) => o.owner === sn.objectives[i].owner && o.x === sn.objectives[i].x && o.active === sn.objectives[i].active), `${mode}/${mi.id}: codec objektiver`);
      ok(d.tags.length === sn.tags.length, `${mode}: codec brikker`); ok(d.match.respawnBlocked === sn.match.respawnBlocked, `${mode}: codec hq`); } }
  ok(w.match.over, `${mode}/${mi.id}: kampen sluttede ikke`); ok(maxB < 600, `${mode}/${mi.id}: snapshot ${maxB} B`);
  console.log(`${mode.padEnd(3)} ${mi.id.padEnd(10)} ${w.match.score.blue}-${w.match.score.red} max ${maxB} B`);
}
console.log(errs.length ? 'FEJL:\n' + [...new Set(errs)].join('\n') : 'OK: alle tilstande');
process.exit(errs.length ? 1 : 0);
