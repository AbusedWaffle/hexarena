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
    bots.set(id, { id, diff: { ...cfg[difficulty] }, difficulty, slot: botIndex++, state: 'hold', stateSince: 0, path: [], pathGoal: null, pathVersion: -1,
      target: null, mem: null, seenSince: null, strafe: 1, strafeUntil: 0, aimErr: 0, lastPos: null, stuckT: 0, flank: false, coverTile: null,
      move: { x: 0, y: 0 }, aim: null, seq: 0, intel: new Map(), lastIntelAt: 0, huntId: null, noChase: false, flankSide: null, role: null, post: null });
    assignRoles();
  }
  const removeBot = (id) => { bots.delete(id); assignRoles(); };
  function resetBot(b) { b.intel = new Map(); Object.assign(b, { lastIntelAt: w.tick * DT, huntId: null, noChase: false, flankSide: null, state: 'hold', stateSince: w.tick * DT, path: [], pathGoal: null, target: null, mem: null, seenSince: null, coverTile: null, flank: false, radial: 0, move: { x: 0, y: 0 }, lastPos: null, stuckT: 0, prevT: null }); }

  // ---------- Taktik: roller, poster, viden ----------
  const P = (id) => w.players.find(q => q.id === id);
  const alive = (team) => w.players.filter(q => q.alive && q.team === team).length;
  let W, H, curMap = null, curMapVer = -1; const sideX = {}, sniperPostCache = {};
  function loadGeometry() { // kaldes ved oprettelse og når banen skiftes (setMap)
    curMap = w.map; curMapVer = w.mapVersion || 0; W = w.map.width; H = w.map.height;
    for (const team of ['blue', 'red']) { const sp = w.map.spawns[team]; sideX[team] = sp.reduce((a, t) => a + t.x, 0) / sp.length; delete sniperPostCache[team]; }
  }
  loadGeometry();
  const towardCenter = (team) => (sideX[team] < W / 2 ? 1 : -1);
  const freeTile = (x, y) => { const t = w.tiles.get(key(x, y)); return t && !isBlocking(t); };
  const coverNear = (x, y) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => !freeTile(x + dx, y + dy));
  // Nærmeste gangbare tile til et idealpunkt; tiles med cover ved siden af foretrækkes
  function postNear(ix, iy, wantCover = true) {
    let best = null;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (freeTile(x, y)) {
      const s = Math.hypot(x - ix, y - iy) + (wantCover && !coverNear(x, y) ? 1.5 : 0);
      if (!best || s < best.s) best = { x, y, s };
    }
    return best && { x: best.x, y: best.y };
  }
  // Sniper-post: i egen halvdel, den tile der ser flest felter i midten af banen
  function sniperPost(team) {
    if (sniperPostCache[team]) return sniperPostCache[team];
    const dir = towardCenter(team), x0 = sideX[team], samples = [];
    for (let y = 1; y < H - 1; y += 2) for (let x = Math.floor(W * 0.35); x <= Math.ceil(W * 0.65); x += 2) if (freeTile(x, y)) samples.push(center({ x, y }));
    let best = null;
    for (let y = 1; y < H - 1; y++) for (let k = 2; k <= Math.floor(W * 0.3); k++) {
      const x = Math.round(x0 + dir * k); if (!freeTile(x, y)) continue;
      const c = center({ x, y }); let seen = 0; for (const s of samples) if (dist(c, s) < 16 * U && hasLineOfSight(w, c, s)) seen++;
      const sc = seen + (coverNear(x, y) ? 3 : 0) - Math.abs(y - H / 2) * 0.3;
      if (!best || sc > best.sc) best = { x, y, sc };
    }
    return (sniperPostCache[team] = best ? { x: best.x, y: best.y } : postNear(x0 + dir * 4, H / 2));
  }
  // Roller fordeles pr. hold: Sniper bagved med lang sigtelinje, Engineer midt bag cover, Scout flanker ad en sidelane, Assault tager en ledig lane, Support følger kampen
  function assignRoles() {
    for (const team of ['blue', 'red']) {
      const mine = [...bots.values()].filter(b => P(b.id)?.team === team);
      const lanes = { top: Math.round(H * 0.2), mid: Math.round(H / 2), bot: Math.round(H * 0.8) }, used = new Set();
      const dir = towardCenter(team), x0 = sideX[team], at = (f) => x0 + dir * W * f;
      const order = ['Sniper', 'Engineer', 'Scout', 'Assault', 'Support'];
      mine.sort((a, b) => order.indexOf(P(a.id).cls) - order.indexOf(P(b.id).cls));
      const pickLane = (pref) => { for (const l of pref) if (!used.has(l)) { used.add(l); return l; } const l = pref[0]; return l; };
      for (const b of mine) {
        const cls = P(b.id).cls;
        if (cls === 'Sniper') { b.role = 'sniper'; b.lane = 'mid'; b.post = sniperPost(team); }
        else if (cls === 'Engineer') { b.role = 'anchor'; b.lane = pickLane(['mid', 'bot', 'top']); b.post = postNear(at(0.38), lanes[b.lane]); }
        else if (cls === 'Scout') { b.role = 'flank'; b.lane = pickLane(b.slot % 2 ? ['top', 'bot', 'mid'] : ['bot', 'top', 'mid']); b.post = postNear(at(0.45), lanes[b.lane]); }
        else if (cls === 'Support') { b.role = 'support'; b.lane = 'mid'; b.post = postNear(at(0.3), lanes.mid); }
        else { b.role = 'lane'; b.lane = pickLane(['top', 'bot', 'mid']); b.post = postNear(at(0.4), lanes[b.lane]); }
        b.pushPost = b.role === 'sniper' ? postNear(at(0.45), lanes.mid) : postNear(at(0.7), lanes[b.lane]);
      }
    }
  }
  // Support: hold dig 2 tiles bag den holdkammerat, der er tættest på kamp
  function supportPost(b, p) {
    const mates = w.players.filter(q => q.alive && q.team === p.team && q.id !== p.id); if (!mates.length) return b.post;
    const known = [...b.intel.values()];
    const score = (q) => known.length ? Math.min(...known.map(k => dist(q, k))) : Math.abs(q.x / U - W / 2);
    const m = mates.reduce((a, q) => (score(q) < score(a) ? q : a)), back = -towardCenter(p.team);
    return postNear(m.x / U + back * 2, m.y / U, false) || b.post;
  }
  // Viden: syn, lyd af skud inden for hearingRange og hvem der ramte en. Hard deler viden på holdet.
  function remember(b, e, src) { b.intel.set(e.id, { id: e.id, x: e.x, y: e.y, t: w.tick * DT, src }); }
  function updateIntel() {
    const hear = (cfg.hearingRange ?? 9) * U;
    for (const ev of w.events) {
      if (ev.type === 'shot') { const s = P(ev.id); if (!s) continue;
        for (const b of bots.values()) { const p = P(b.id); if (p && p.alive && p.team !== s.team && dist(p, ev.from) <= hear) remember(b, s, 'heard'); } }
      if (ev.type === 'hit') { const b = bots.get(ev.id), s = P(ev.by); if (b && s && P(ev.id)?.team !== s.team) remember(b, s, 'hit'); }
    }
    const now = w.tick * DT, mem = cfg.memorySec ?? 3;
    for (const b of bots.values()) for (const [id, k] of b.intel) { const e = P(id); if (!e || !e.alive || now - k.t > mem) b.intel.delete(id); }
  }
  function share(b, p, e) { if (!b.diff.shareIntel) return; for (const o of bots.values()) if (o !== b && P(o.id)?.team === p.team) remember(o, e, 'team'); }
  function hunters(team, id, except) { let n = 0; for (const o of bots.values()) { if (o === except) continue; const q = P(o.id); if (q && q.alive && q.team === team && (o.huntId === id || (o.state === 'engage' && o.target?.id === id && !o.noChase))) n++; } return n; }
  const huntPartner = (team, id, except) => [...bots.values()].find(o => o !== except && o.huntId === id && P(o.id)?.team === team);

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
      b.target = best.e; remember(b, best.e, 'seen'); share(b, p, best.e);
      for (const e of enemiesOf(p)) if (e !== best.e && dist(p, e) <= visionPx && hasLineOfSight(w, p, e)) remember(b, e, 'seen');
    } else { b.target = null; b.seenSince = null; }
    // mem = den nyeste/nærmeste viden om en fjende (bruges til jagt, cover og granater)
    let m = null; for (const k of b.intel.values()) { const s = (now - k.t) * 2 + dist(p, k) / U * 0.3; if (!m || s < m.s) m = { ...k, s }; }
    b.mem = m; if (m) b.lastIntelAt = now;
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
    if (b.state === 'hold') {
      if (b.role === 'support') return supportPost(b, p);
      // Ingen kontakt i et stykke tid: skub frem ad egen lane mod fjendens side (ikke direkte mod en spiller)
      const quiet = w.tick * DT - b.lastIntelAt, pa = b.diff.pushAfterSec ?? 15;
      if (quiet > pa * 2) { const sp = w.map.spawns[p.team === 'blue' ? 'red' : 'blue']; return sp[(b.slot + Math.floor(quiet / pa)) % sp.length]; } // stadig stille: afsøg fjendens side
      if (b.pushPost && quiet > pa) return b.pushPost;
      return b.post;
    }
    const tgt = b.mem;
    if (!tgt) return b.post;
    let g = tileOf(tgt);
    if (b.flank) { // gå udenom: mål et punkt 4 tiles til siden for fjenden
      const n = norm({ x: tgt.x - p.x, y: tgt.y - p.y }), s = b.flankSide ?? (b.slot % 2 ? 1 : -1);
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
    // Jagt kun på noget, botten ved (set, hørt eller ramt af). Ellers holder den sin post.
    let hunt = false; b.noChase = false;
    if (b.mem) {
      const ag = b.diff.aggression ?? 1, post = b.post ? center(b.post) : p, nearPost = dist(post, b.mem) <= (cfg.holdRadius ?? 6) * U;
      hunt = ag === 0 ? nearPost : (alive(p.team) >= alive(p.team === 'blue' ? 'red' : 'blue') || nearPost);
      if (hunt && b.huntId !== b.mem.id && hunters(p.team, b.mem.id, b) >= (cfg.maxBotsPerTarget ?? 2)) hunt = false;
    }
    const prevHunt = b.huntId; b.huntId = hunt ? b.mem.id : null;
    if (hunt && prevHunt !== b.huntId) { // Hard: to bots på samme mål angriber fra hver sin side
      const partner = huntPartner(p.team, b.huntId, b);
      if (partner && (b.diff.aggression ?? 1) >= 2) { b.flank = true; partner.flank = true; partner.flankSide = partner.flankSide ?? 1; b.flankSide = -partner.flankSide; }
      else { b.flank = R() < b.diff.flankChance + (prof(p).flankBonus ?? 0); b.flankSide = null; }
    }
    if (b.target && b.target.id !== b.huntId && hunters(p.team, b.target.id, b) >= (cfg.maxBotsPerTarget ?? 2)) b.noChase = true; // tredje bot skyder fra hvor den står, men følger ikke efter
    // Tilstandsvalg (simpel utility)
    let next = hunt ? 'seek' : 'hold';
    if (hpf < (cfg.retreatHpFrac ?? 0.3) && (b.state === 'retreat' || retreatingCount(p.team) < maxRetreat)) next = 'retreat';
    else if (threat && (p.charges === 0 || hpf < (cfg.coverHpFrac ?? 0.55)) && (b.state === 'cover' || R() < b.diff.coverBias)) next = 'cover';
    else if (b.target) next = 'engage';
    // I undertal: træk dig i cover i stedet for at presse (Hard presser alligevel, hvis den har liv nok)
    if (next === 'engage') {
      const seen = enemiesOf(p).filter(e => dist(p, e) <= 10 * U && hasLineOfSight(w, p, e)).length, mates = w.players.filter(q => q.alive && q.team === p.team && dist(q, p) <= 8 * U).length;
      if (seen > mates && ((b.diff.aggression ?? 1) < 2 || hpf < 0.7) && (b.state === 'cover' || R() < b.diff.coverBias)) next = 'cover';
    }
    // Retreat og cover er tidsbegrænsede, så botten ikke bare står stille
    if (next === 'retreat' && (hpf > 0.8 || (b.state === 'retreat' && now - b.stateSince > (cfg.retreatMaxSec ?? 4)))) next = b.target ? 'engage' : (hunt ? 'seek' : 'hold');
    if (next === 'cover' && b.state === 'cover' && now - b.stateSince > (cfg.coverMaxSec ?? 3) && p.charges > 0) next = b.target ? 'engage' : (hunt ? 'seek' : 'hold');
    if (next === 'cover' && p.charges === wp.charges && hpf >= (cfg.coverHpFrac ?? 0.55) && !(b.state === 'cover' && now - b.stateSince < 1)) next = b.target ? 'engage' : (hunt ? 'seek' : 'hold');
    // Kort rækkevidde: kom tæt på via cover i stedet for at gå lige på
    if (next === 'engage' && prof(p).coverApproach && dist(p, b.target) > wp.range * U * (prof(p).fireRangeFrac ?? 1) * 1.3) next = 'approach';
    if (next !== b.state) { b.state = next; b.stateSince = now; b.path = []; if (next === 'cover') b.coverTile = threat ? findCover(p, threat) : null; }
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
      if (d > pref * 1.3) b.radial = b.noChase ? 0 : 1; else if (d < pref * 0.6) b.radial = -1; else if (b.radial === 1 ? d < pref * 1.0 : b.radial === -1 ? d > pref * 0.85 : false) b.radial = 0;
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
      if (b.state === 'hold' && !b.path.length && !b.target) { // på posten: stå roligt og kig mod banen / sidste kendte fjende
        const look = b.mem || { x: W * U / 2, y: p.y };
        f.aim = norm({ x: look.x - p.x, y: look.y - p.y });
      }
      if (b.target) { const a = Math.atan2(b.target.y - p.y, b.target.x - p.x) + b.aimErr; f.aim = { x: Math.cos(a), y: Math.sin(a) };
        // skyder mens den trækker sig, hvis den har ladninger
        if ((b.state === 'retreat' || b.state === 'approach') && p.charges > 0 && dist(p, b.target) <= wp.range * U * Math.min(0.9, prof(p).fireRangeFrac ?? 0.9) && b.seenSince != null && (now - b.seenSince) * 1000 >= b.diff.reactionMs) f.fire = true;
      } else if (Math.hypot(f.move.x, f.move.y) > 0) f.aim = { ...f.move };
    }
    f.move = smoothMove(b, f.move);
    if (!t && b.state !== 'engage' && Math.hypot(f.move.x, f.move.y) > 0.2 && !b.target && !(b.state === 'hold' && b.mem)) f.aim = norm(f.move);
    // Når botten bare går (ikke kæmper eller skyder), sendes intet sigte, så figuren vender i gåretningen ligesom en spiller
    if (!f.fire && b.state !== 'engage' && Math.hypot(f.move.x, f.move.y) > 0.2) f.aim = null;
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
    if (w.map !== curMap || (w.mapVersion || 0) !== curMapVer) { loadGeometry(); mapVersion++; for (const b of bots.values()) resetBot(b); assignRoles(); } // ny bane: nye lanes, poster og stier
    for (const e of w.events) {
      if (e.type === 'crateBroken' || e.type === 'crateRespawned') mapVersion++;
      if (e.type === 'roundStart') { for (const b of bots.values()) resetBot(b); assignRoles(); } // ny runde: glem viden, mål og stier
    }
    updateIntel();
    const out = {};
    for (const b of bots.values()) {
      const p = w.players.find(q => q.id === b.id); if (!p) continue;
      if (!p.alive) { b.state = 'hold'; b.path = []; b.target = null; b.mem = null; b.huntId = null; continue; }
      if ((w.tick + b.slot) % thinkEvery === 0) think(b, p);
      out[b.id] = act(b, p);
    }
    return out;
  }
  // Til debug-overlay
  const debug = () => [...bots.values()].map(b => ({ id: b.id, state: b.state, path: b.path, target: b.target?.id ?? null, difficulty: b.difficulty, role: b.role, lane: b.lane, post: b.post, hunt: b.huntId, noChase: b.noChase, intel: b.intel.size }));
  return { addBot, removeBot, frames, debug, bots };
}
