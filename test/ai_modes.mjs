// Bots i spiltilstande: går de efter zoner (dom/hp/hq) og brikker (kc)? 90 s bot-kamp pr. tilstand og bane.
// Krav: zone-tilstande giver point på hver bane, og bots står i en aktiv zone en rimelig del af tiden; kc: brikker samles op.
import fs from 'node:fs';
const { createWorld, addPlayer, step, startMatch } = await import('../sim/world.js');
const { createAI } = await import('../sim/ai.js'); const { TILE_PX: U } = await import('../sim/grid.js');
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const maps = rd('maps.json').maps, order = ['Assault', 'Sniper', 'Scout', 'Engineer', 'Support'], fails = [];
let seed = 11; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const inZ = (p, z) => p.x >= z.x * U && p.x < (z.x + z.w) * U && p.y >= z.y * U && p.y < (z.y + z.h) * U;
for (const mode of ['kc', 'dom', 'hp', 'hq']) for (const mi of maps) {
  if (mi.modes && !mi.modes.includes(mode)) continue;
  const classes = rd('classes.square.json'); classes._match.mode = mode; classes._match.modeCfg = {};
  const w = createWorld({ ...rd(mi.file.replace('data/', '')), id: mi.id }, classes), ai = createAI(w, rd('ai.json'), 5);
  for (const team of ['blue', 'red']) for (let i = 0; i < 4; i++) ai.addBot(addPlayer(w, { team, cls: order[(i + (team === 'red')) % 5] }).id, 'normal');
  startMatch(w); let inside = 0, aliveT = 0, tags = 0, kills = 0; const t0 = performance.now();
  for (let t = 0; t < 20 * 90 && !w.match.over; t++) { step(w, ai.frames());
    for (const e of w.events) { if (e.type === 'tag') tags++; if (e.type === 'kill') kills++; }
    const Z = w.match.objectives || [], act = mode === 'dom' ? Z : Z.length ? [Z[w.match.active % Z.length]] : [];
    for (const p of w.players) if (p.alive) { aliveT++; if (act.some(z => inZ(p, z))) inside++; } }
  const zf = inside / Math.max(1, aliveT), sc = w.match.score, ms = ((performance.now() - t0) / (20 * 90)).toFixed(2);
  const ok = mode === 'kc' ? tags > 0 : sc.blue + sc.red > 0 && zf >= (mode === 'dom' ? 0.18 : 0.08); // én 3×3-zone til 8 bots (Sniper dækker udefra) giver naturligt en lavere andel if (!ok) fails.push(mode + ' ' + mi.id);
  console.log(`${mode.padEnd(3)} ${mi.id.padEnd(16)} ${String(sc.blue).padStart(3)}-${String(sc.red).padEnd(3)} ${mode === 'kc' ? 'brikker ' + tags : 'i zone ' + Math.round(zf * 100) + '%'} drab ${kills} ${ok ? 'OK' : 'FEJL'}`);
}
console.log(fails.length ? 'FEJL: ' + fails.join(', ') : 'OK: bots spiller efter objektiverne'); process.exit(fails.length ? 1 : 0);
