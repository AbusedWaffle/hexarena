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
export function findPath(w, from, to, maxNodes = 2000, extraCost = null) {
  const goal = key(to.x, to.y); const t = w.tiles.get(goal); if (!t || isBlocking(t)) return null;
  const h = (x, y) => { const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const open = [{ x: from.x, y: from.y, g: 0, f: h(from.x, from.y) }], came = new Map(), g = new Map([[key(from.x, from.y), 0]]);
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
    if (ck === goal) { const path = []; let k = ck; while (came.has(k)) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = came.get(k); } return path; }
    for (const nb of neighbors(w, cur.x, cur.y)) {
      const nk = key(nb.x, nb.y), ng = cur.g + nb.cost + (extraCost ? extraCost(nb.x, nb.y) : 0);
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
  function resetBot(b) { Object.assign(b, { state: 'seek', stateSince: w.tick * DT, path: [], pathGoal: null, target: null, mem: null, seenSince: null, coverTile: null, flank: false, radial: 0, move: { x: 0, y: 0 }, lastPos: null, stuckT: 0, prevT: null }); }

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
    if (b.state === 'approach' && b.target) return tileOf(b.target);
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
  const prof = (p) => (cfg.classes && cfg.classes[p.cls]) || {};
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
    // Retreat og cover er tidsbegrænsede, så botten ikke bare står stille
    if (next === 'retreat' && (hpf > 0.8 || (b.state === 'retreat' && now - b.stateSince > (cfg.retreatMaxSec ?? 4)))) next = b.target ? 'engage' : 'seek';
    if (next === 'cover' && b.state === 'cover' && now - b.stateSince > (cfg.coverMaxSec ?? 3) && p.charges > 0) next = b.target ? 'engage' : 'seek';
    if (next === 'cover' && p.charges === wp.charges && hpf >= (cfg.coverHpFrac ?? 0.55)) next = b.target ? 'engage' : 'seek';
    // Kort rækkevidde: kom tæt på via cover i stedet for at gå lige på
    if (next === 'engage' && prof(p).coverApproach && dist(p, b.target) > wp.range * U * (prof(p).fireRangeFrac ?? 1) * 1.3) next = 'approach';
    if (next !== b.state) { b.state = next; b.stateSince = now; b.path = []; if (next === 'seek') b.flank = R() < b.diff.flankChance + (prof(p).flankBonus ?? 0); if (next === 'cover') b.coverTile = threat ? findCover(p, threat) : null; }
    // Sti
    if (b.state !== 'engage') {
      const g = goalFor(b, p);
      if (g && (!b.pathGoal || g.x !== b.pathGoal.x || g.y !== b.pathGoal.y || b.pathVersion !== mapVersion || !b.path.length)) {
        const th = b.state === 'approach' || (b.state === 'seek' && prof(p).coverApproach) ? (b.target || b.mem) : null, exp = cfg.exposureCost ?? 3, seen = new Map();
        const cost = th ? (x, y) => { const k = key(x, y); if (!seen.has(k)) seen.set(k, hasLineOfSight(w, center({ x, y }), th) ? exp : 0); return seen.get(k); } : null;
        b.path = findPath(w, tileOf(p), g, 2000, cost) || findPath(w, tileOf(p), g) || []; b.pathGoal = g; b.pathVersion = mapVersion;
      }
    }
    // Strafe-retning skifter tilfældigt
    if (now > b.strafeUntil) { b.strafe = R() < 0.5 ? -1 : 1; b.strafeUntil = now + (cfg.strafeMinSec ?? 0.8) + R() * ((cfg.strafeMaxSec ?? 1.5) - (cfg.strafeMinSec ?? 0.8)); }
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
      const d = dist(p, t), pref = wp.range * U * (prof(p).preferredRangeFrac ?? cfg.preferredRangeFrac ?? 0.6), to = norm({ x: t.x - p.x, y: t.y - p.y });
      // Hysterese: skift kun frem/tilbage, når afstanden er tydeligt forkert, så botten ikke vipper på grænsen
      if (d > pref * 1.3) b.radial = 1; else if (d < pref * 0.6) b.radial = -1; else if (b.radial === 1 ? d < pref * 1.0 : b.radial === -1 ? d > pref * 0.85 : false) b.radial = 0;
      const radial = b.radial ?? 0, sa = cfg.strafeAmount ?? 0.6;
      let mv = { x: to.x * radial - to.y * b.strafe * sa, y: to.y * radial + to.x * b.strafe * sa };
      // undgå at strafe ind i en væg
      const probe = { x: p.x + norm(mv).x * U, y: p.y + norm(mv).y * U }, pt = w.tiles.get(key(Math.floor(probe.x / U), Math.floor(probe.y / U)));
      if (!pt || isBlocking(pt)) { b.strafe *= -1; b.strafeUntil = now + (cfg.strafeMinSec ?? 0.8); mv = { x: to.x * radial, y: to.y * radial }; }
      f.move = norm(mv); if (!mv.x && !mv.y) f.move = { x: 0, y: 0 };
      // Sigte: lead på projektiler + sigtefejl
      let ax = t.x, ay = t.y;
      const prev = b.prevT && b.prevT.id === t.id ? b.prevT : null;
      if (prev && wp.projectileSpeed > 0 && b.diff.leadTarget > 0) { const vx = (t.x - prev.x) / DT, vy = (t.y - prev.y) / DT, tt = d / (wp.projectileSpeed * U); ax += vx * tt * b.diff.leadTarget; ay += vy * tt * b.diff.leadTarget; }
      const a = Math.atan2(ay - p.y, ax - p.x) + b.aimErr; f.aim = { x: Math.cos(a), y: Math.sin(a) };
      const reacted = b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs;
      if (reacted && d <= wp.range * U * (prof(p).fireRangeFrac ?? 0.95) && p.charges > 0 && !p.salvo) {
        const ray = raycast(w, p, f.aim, d, { ignoreId: p.id });  // ingen friendly fire-skud gennem holdkammerater
        if (!(ray.entityId && ray.team === p.team)) f.fire = true;
      }
    } else {
      f.move = followPath(b, p);
      if (b.target) { const a = Math.atan2(b.target.y - p.y, b.target.x - p.x) + b.aimErr; f.aim = { x: Math.cos(a), y: Math.sin(a) };
        // skyder mens den trækker sig, hvis den har ladninger
        if ((b.state === 'retreat' || b.state === 'approach') && p.charges > 0 && dist(p, b.target) <= wp.range * U * Math.min(0.9, prof(p).fireRangeFrac ?? 0.9) && b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs) f.fire = true;
      } else if (Math.hypot(f.move.x, f.move.y) > 0) f.aim = { ...f.move };
    }
    f.move = smoothMove(b, f.move);
    if (!t && b.state !== 'engage' && Math.hypot(f.move.x, f.move.y) > 0.2 && !b.target) f.aim = norm(f.move);
    if (p.abilityCooldownLeft === 0) useAbility(b, p, f, t); // efter udglatning, så dash går præcis i den ønskede retning
    b.prevT = t ? { id: t.id, x: t.x, y: t.y } : null;
    b.move = f.move; b.aim = f.aim;
    return f;
  }

  // Blød bevægelse: drej højst maxTurnDegPerSec og accelerér/brems over et par ticks i stedet for at vende på et tick
  function smoothMove(b, want) {
    const prev = b.move || { x: 0, y: 0 }, pl = Math.hypot(prev.x, prev.y), wl = Math.min(1, Math.hypot(want.x, want.y)), k = cfg.moveAccel ?? 0.35;
    if (wl < 0.05) { const m = { x: prev.x * (1 - k * 1.5), y: prev.y * (1 - k * 1.5) }; return Math.hypot(m.x, m.y) < 0.1 ? { x: 0, y: 0 } : m; }
    const wa = Math.atan2(want.y, want.x);
    if (pl < 0.1) return { x: Math.cos(wa) * Math.max(wl * k, 0.3), y: Math.sin(wa) * Math.max(wl * k, 0.3) };
    const pa = Math.atan2(prev.y, prev.x), maxT = (cfg.maxTurnDegPerSec ?? 540) * Math.PI / 180 * DT;
    let da = wa - pa; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const a = pa + Math.max(-maxT, Math.min(maxT, da)), l = pl + (wl - pl) * k * (Math.abs(da) > Math.PI / 2 ? 0.5 : 1);
    return { x: Math.cos(a) * l, y: Math.sin(a) * l };
  }

  // Ability-regler pr. klasse. Sætter f.ability (og evt. aim/move) i samme InputFrame; skyder ikke i samme tick.
  function useAbility(b, p, f, t) {
    const ab = w.classes[p.cls].ability; if (!ab) return;
    const now = w.tick * DT, hpf = p.hp / p.maxHp, reacted = t && b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs;
    const use = (aim, move) => { f.ability = true; f.fire = false; if (aim) f.aim = aim; if (move) f.move = move; };
    switch (ab.id) {
      case 'grenade': { // 2+ fjender klumpet, mål bag cover (husket), eller mål kan dræbes af granaten
        const tg = t || (b.mem && w.players.find(q => q.id === b.mem.id && q.alive)), range = ab.throwRange * U;
        if (!tg || dist(p, tg) > range) return;
        if (!t && !(b.mem && now - b.mem.t < 1.5)) return;
        const clump = enemiesOf(p).filter(e => dist(e, tg) <= ab.radius * U).length >= 2;
        if (clump || !t || tg.hp <= ab.damage) { const d = dist(p, tg), n = norm({ x: tg.x - p.x, y: tg.y - p.y }), fr = Math.max(0.05, Math.min(1, d / range)); use({ x: n.x * fr, y: n.y * fr }); }
        return;
      }
      case 'focus': // aktiveres lige før et skud, når målet ikke dør af et normalt skud
        if (b.state === 'engage' && reacted && p.charges > 0 && p.focusLeft === 0 && t.hp > w.classes[p.cls].weapon.damage) use();
        return;
      case 'dash': {
        const threat = t || b.mem; if (!threat) return;
        const away = norm({ x: p.x - threat.x, y: p.y - threat.y }), d = dist(p, threat), rng = w.classes[p.cls].weapon.range * U;
        if (hpf < 0.4 && d < rng) use(null, away);                                           // flygt
        else if (t && hpf > 0.6 && d > rng * 0.9 && d < rng + ab.distance * U * 0.8) use(null, { x: -away.x, y: -away.y }); // luk afstanden
        return;
      }
      case 'deploy_crate': // under beskydning uden cover: kasse mod truslen
        if (t && now - (p.lastDamageAt ?? -1e9) < 0.6 && hasLineOfSight(w, p, t) && !(p.deployedCrate && p.deployedCrate.type === 'crate' && dist(p, center(p.deployedCrate)) < 2 * U))
          use(norm({ x: t.x - p.x, y: t.y - p.y }));
        return;
      case 'heal_zone': { // 2+ sårede holdkammerater (inkl. sig selv) i zonen
        const hurt = w.players.filter(q => q.alive && q.team === p.team && dist(q, p) <= ab.radius * U * 0.8 && q.hp / q.maxHp < 0.7).length;
        if (hurt >= 2 || (hpf < 0.4 && t)) use();
        return;
      }
    }
  }

  // Kaldes én gang pr. tick før step(). Læser seneste tick's events (kasser ændret => ny sti).
  function frames() {
    for (const e of w.events) {
      if (e.type === 'crateBroken' || e.type === 'crateRespawned') mapVersion++;
      if (e.type === 'roundStart') for (const b of bots.values()) resetBot(b); // ny runde: glem mål, stier og strafe
    }
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
