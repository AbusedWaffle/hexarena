// AI-controller (kun på hosten). En bot giver præcis samme InputFrame som en spiller, så den kan sidde på enhver plads.
// Brug: const ai = createAI(world, aiConfig); ai.addBot(playerId, 'normal'); ... inputs = { ...inputs, ...ai.frames(world) }; step(world, inputs)
import { TILE_PX as U, key } from './grid.js';
import { neighbors, hasLineOfSight, raycast, isBlocking, DT } from './world.js';

const rnd = (r) => r();
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tileOf = (p) => ({ x: Math.floor(p.x / U), y: Math.floor(p.y / U) });
const center = (t) => ({ x: (t.x + 0.5) * U, y: (t.y + 0.5) * U });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

// A* på tiles med neighbors() (8 retninger, ingen hjørneskæring). Returnerer tile-liste uden starttile.
export function findPath(w, from, to, maxNodes = 2000) {
  const goal = key(to.x, to.y); const t = w.tiles.get(goal); if (!t || isBlocking(t)) return null;
  const h = (x, y) => { const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const open = [{ x: from.x, y: from.y, g: 0, f: h(from.x, from.y) }], came = new Map(), g = new Map([[key(from.x, from.y), 0]]);
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
    if (ck === goal) { const path = []; let k = ck; while (came.has(k)) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = came.get(k); } return path; }
    for (const nb of neighbors(w, cur.x, cur.y)) {
      const nk = key(nb.x, nb.y), ng = cur.g + nb.cost;
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, ck); open.push({ x: nb.x, y: nb.y, g: ng, f: ng + h(nb.x, nb.y) }); }
    }
  }
  return null;
}

// Kan en krop med radius r gå i lige linje fra a til b? (tre stråler: midte og begge sider)
function clearWalk(w, a, b, r) {
  const d = dist(a, b); if (d < 1) return true; const n = { x: (b.x - a.x) / d, y: (b.y - a.y) / d }, px = -n.y * r, py = n.x * r;
  for (const s of [0, 1, -1]) { const o = { x: a.x + px * s, y: a.y + py * s }; if (raycast(w, o, n, d, { hitEntities: false }).hit) return false; }
  return true;
}

export function createAI(w, cfg, seed = 1) {
  const R = mulberry(seed), bots = new Map(), aiData = w.classes._ai || {};
  const visionPx = (aiData.visionRange ?? 16) * U, maxRetreat = aiData.maxRetreatingPerTeam ?? 1;
  let mapVersion = 0, botIndex = 0;
  const thinkEvery = Math.max(1, Math.round(1 / DT / (cfg.thinkHz || 5)));

  function addBot(id, difficulty = 'normal') {
    bots.set(id, { id, diff: { ...cfg[difficulty] }, difficulty, slot: botIndex++, state: 'seek', stateSince: 0, path: [], pathGoal: null, pathVersion: -1,
      target: null, mem: null, seenSince: null, strafe: 1, strafeUntil: 0, aimErr: 0, lastPos: null, stuckT: 0, flank: false, coverTile: null,
      move: { x: 0, y: 0 }, aim: null, seq: 0 });
  }
  const removeBot = (id) => bots.delete(id);

  function enemiesOf(p) { return w.players.filter(e => e.alive && e.team !== p.team); }

  function perceive(b, p) {
    let best = null;
    for (const e of enemiesOf(p)) {
      const d = dist(p, e); if (d > visionPx || !hasLineOfSight(w, p, e)) continue;
      const score = d / U + e.hp / e.maxHp * 4 - (b.target && b.target.id === e.id ? 3 : 0); // hold fast i nuværende mål
      if (!best || score < best.score) best = { e, score };
    }
    const now = w.tick * DT;
    if (best) {
      if (!b.target || b.target.id !== best.e.id) b.seenSince = now;
      b.target = best.e; b.mem = { id: best.e.id, x: best.e.x, y: best.e.y, t: now };
    } else { b.target = null; b.seenSince = null; if (b.mem && now - b.mem.t > (cfg.memorySec ?? 3)) b.mem = null; }
  }

  function retreatingCount(team) { let n = 0; for (const b of bots.values()) { const p = w.players.find(q => q.id === b.id); if (p && p.alive && p.team === team && b.state === 'retreat') n++; } return n; }

  // Nærmeste gulv-tile inden for 5 tiles, som skjuler botten for truslen
  function findCover(p, threat) {
    const t0 = tileOf(p); let best = null;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const t = w.tiles.get(key(t0.x + dx, t0.y + dy)); if (!t || isBlocking(t)) continue;
      const c = center(t); if (hasLineOfSight(w, c, threat)) continue;
      const s = Math.hypot(dx, dy) - dist(c, threat) / U * 0.3; if (!best || s < best.s) best = { t: { x: t.x, y: t.y }, s };
    }
    return best && best.t;
  }

  function goalFor(b, p) {
    if (b.state === 'retreat') { // mod en levende Support på holdet, ellers mod egen spawn
      const sup = w.players.find(q => q.alive && q.team === p.team && q.id !== p.id && w.classes[q.cls].ability?.id === 'heal_zone');
      if (sup) return tileOf(sup); const sp = w.map.spawns[p.team]; return sp[b.slot % sp.length]; }
    if (b.state === 'cover' && b.coverTile) return b.coverTile;
    const tgt = b.mem || nearest(p, enemiesOf(p));
    if (!tgt) return null;
    let g = tileOf(tgt);
    if (b.flank) { // gå udenom: mål et punkt 4 tiles til siden for fjenden
      const n = norm({ x: tgt.x - p.x, y: tgt.y - p.y }), s = b.slot % 2 ? 1 : -1;
      const f = { x: Math.floor((tgt.x - n.y * s * 4 * U) / U), y: Math.floor((tgt.y + n.x * s * 4 * U) / U) };
      const ft = w.tiles.get(key(f.x, f.y)); if (ft && !isBlocking(ft)) g = f;
    }
    return g;
  }
  const nearest = (p, list) => list.reduce((a, e) => (!a || dist(p, e) < dist(p, a) ? e : a), null);

  function think(b, p) {
    perceive(b, p);
    const c = w.classes[p.cls], wp = c.weapon, hpf = p.hp / p.maxHp, now = w.tick * DT;
    const threat = b.target || b.mem;
    // Tilstandsvalg (simpel utility)
    let next = 'seek';
    if (hpf < (cfg.retreatHpFrac ?? 0.3) && (b.state === 'retreat' || retreatingCount(p.team) < maxRetreat)) next = 'retreat';
    else if (threat && (p.charges === 0 || hpf < (cfg.coverHpFrac ?? 0.55)) && (b.state === 'cover' || R() < b.diff.coverBias)) next = 'cover';
    else if (b.target) next = 'engage';
    // Der er ingen HP-regen endnu, så retreat er tidsbegrænset; ellers står botten bare ved spawn
    if (next === 'retreat' && (hpf > 0.8 || (b.state === 'retreat' && now - b.stateSince > (cfg.retreatMaxSec ?? 4)))) next = b.target ? 'engage' : 'seek';
    if (next === 'cover' && b.state === 'cover' && now - b.stateSince > (cfg.coverMaxSec ?? 3) && p.charges > 0) next = b.target ? 'engage' : 'seek';
    if (next === 'cover' && p.charges === wp.charges && hpf >= (cfg.coverHpFrac ?? 0.55)) next = b.target ? 'engage' : 'seek';
    if (next !== b.state) { b.state = next; b.stateSince = now; b.path = []; if (next === 'seek') b.flank = R() < b.diff.flankChance; if (next === 'cover') b.coverTile = threat ? findCover(p, threat) : null; }
    // Sti
    if (b.state !== 'engage') {
      const g = goalFor(b, p);
      if (g && (!b.pathGoal || g.x !== b.pathGoal.x || g.y !== b.pathGoal.y || b.pathVersion !== mapVersion || !b.path.length)) {
        b.path = findPath(w, tileOf(p), g) || []; b.pathGoal = g; b.pathVersion = mapVersion;
      }
    }
    // Strafe-retning skifter tilfældigt
    if (now > b.strafeUntil) { b.strafe = R() < 0.5 ? -1 : 1; b.strafeUntil = now + 0.6 + R() * 0.8; }
    b.aimErr = (R() * 2 - 1) * b.diff.aimErrorDeg * Math.PI / 180;
    // Fastlåst? (bevæget < 0,3 tile det seneste sekund)
    if (b.lastPos && dist(b.lastPos, p) < 0.3 * U * thinkEvery / 20) { b.stuckT += thinkEvery * DT; } else b.stuckT = 0;
    b.lastPos = { x: p.x, y: p.y };
    if (b.stuckT > 1) { b.path = []; b.pathGoal = null; b.flank = !b.flank; b.stuckT = 0; }
  }

  function followPath(b, p) {
    while (b.path.length && dist(p, center(b.path[0])) < 0.35 * U) b.path.shift();
    if (!b.path.length) return { x: 0, y: 0 };
    // Glatning: sigt mod det fjerneste waypoint, der kan gås lige til
    let i = 0; for (let j = Math.min(b.path.length - 1, 6); j > 0; j--) if (clearWalk(w, p, center(b.path[j]), p.radius * 0.95)) { i = j; break; }
    return norm({ x: center(b.path[i]).x - p.x, y: center(b.path[i]).y - p.y });
  }

  function act(b, p) {
    const wp = w.classes[p.cls].weapon, now = w.tick * DT, f = { move: { x: 0, y: 0 }, aim: null, fire: false, ability: false, seq: ++b.seq };
    const t = b.target && b.target.alive ? b.target : null;
    if (b.state === 'engage' && t) {
      const d = dist(p, t), pref = wp.range * U * (cfg.preferredRangeFrac ?? 0.6), to = norm({ x: t.x - p.x, y: t.y - p.y });
      const radial = d > pref * 1.15 ? 1 : d < pref * 0.75 ? -1 : 0;
      let mv = { x: to.x * radial - to.y * b.strafe * 0.8, y: to.y * radial + to.x * b.strafe * 0.8 };
      // undgå at strafe ind i en væg
      const probe = { x: p.x + norm(mv).x * U, y: p.y + norm(mv).y * U }, pt = w.tiles.get(key(Math.floor(probe.x / U), Math.floor(probe.y / U)));
      if (!pt || isBlocking(pt)) { b.strafe *= -1; mv = { x: to.x * radial, y: to.y * radial }; }
      f.move = norm(mv); if (!mv.x && !mv.y) f.move = { x: 0, y: 0 };
      // Sigte: lead på projektiler + sigtefejl
      let ax = t.x, ay = t.y;
      const prev = b.prevT && b.prevT.id === t.id ? b.prevT : null;
      if (prev && wp.projectileSpeed > 0 && b.diff.leadTarget > 0) { const vx = (t.x - prev.x) / DT, vy = (t.y - prev.y) / DT, tt = d / (wp.projectileSpeed * U); ax += vx * tt * b.diff.leadTarget; ay += vy * tt * b.diff.leadTarget; }
      const a = Math.atan2(ay - p.y, ax - p.x) + b.aimErr; f.aim = { x: Math.cos(a), y: Math.sin(a) };
      const reacted = b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs;
      if (reacted && d <= wp.range * U * 0.95 && p.charges > 0 && !p.salvo) {
        const ray = raycast(w, p, f.aim, d, { ignoreId: p.id });  // ingen friendly fire-skud gennem holdkammerater
        if (!(ray.entityId && ray.team === p.team)) f.fire = true;
      }
    } else {
      f.move = followPath(b, p);
      if (b.target) { const a = Math.atan2(b.target.y - p.y, b.target.x - p.x) + b.aimErr; f.aim = { x: Math.cos(a), y: Math.sin(a) };
        // skyder mens den trækker sig, hvis den har ladninger
        if (b.state === 'retreat' && p.charges > 0 && dist(p, b.target) <= wp.range * U * 0.8 && b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs) f.fire = true;
      } else if (Math.hypot(f.move.x, f.move.y) > 0) f.aim = { ...f.move };
    }
    b.prevT = t ? { id: t.id, x: t.x, y: t.y } : null;
    b.move = f.move; b.aim = f.aim;
    return f;
  }

  // Kaldes én gang pr. tick før step(). Læser seneste tick's events (kasser ændret => ny sti).
  function frames() {
    for (const e of w.events) if (e.type === 'crateBroken' || e.type === 'crateRespawned') { mapVersion++; break; }
    const out = {};
    for (const b of bots.values()) {
      const p = w.players.find(q => q.id === b.id); if (!p) continue;
      if (!p.alive) { b.state = 'seek'; b.path = []; b.target = null; b.mem = null; continue; }
      if ((w.tick + b.slot) % thinkEvery === 0) think(b, p);
      out[b.id] = act(b, p);
    }
    return out;
  }
  // Til debug-overlay
  const debug = () => [...bots.values()].map(b => ({ id: b.id, state: b.state, path: b.path, target: b.target?.id ?? null, difficulty: b.difficulty }));
  return { addBot, removeBot, frames, debug, bots };
}
