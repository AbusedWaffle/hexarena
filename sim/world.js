// Ren simulation (ingen Phaser). Hosten kalder step(world, inputs) 20 gange i sekundet.
import { HEX_PX, HEX_DIST, DIRS, key, hexToPixel, pixelToHex, hexCorners } from './hex.js';
export const TICK_HZ = 20, DT = 1 / TICK_HZ;
const PLAYER_RADIUS_HEX = 0.2;

export function createWorld(map, classes) {
  const tiles = new Map();
  for (const t of map.tiles) tiles.set(key(t.q, t.r), { q: t.q, r: t.r, type: t.type, hp: t.type === 'crate' ? (t.hp ?? classes._match.crateHp) : 0, maxHp: t.hp ?? classes._match.crateHp });
  return { map, classes, tiles, players: [], projectiles: [], events: [], tick: 0,
    match: { score: { blue: 0, red: 0 }, timeLeft: classes._match.durationSec, over: false }, nextId: 1 };
}

export function addPlayer(w, { team, cls, id }) {
  const c = w.classes[cls], wp = c.weapon;
  const p = { id: id ?? 'p' + w.nextId++, team, cls, radius: (c.radius ?? PLAYER_RADIUS_HEX) * HEX_PX,
    x: 0, y: 0, hp: c.hp, maxHp: c.hp, alive: true, aim: { x: 1, y: 0 },
    charges: wp.charges, chargeProgress: 0, fireCooldownLeft: 0, salvo: null,
    abilityCooldownLeft: 0, spawnShieldLeft: 0, respawnLeft: 0, kills: 0, deaths: 0, lastSeq: 0 };
  w.players.push(p); spawn(w, p); return p;
}

function spawn(w, p) {
  // Ledig spawn længst fra synlige fjender (fjender uden synslinje tæller svagere)
  const list = w.map.spawns[p.team]; let s = list[0], best = -Infinity;
  for (const c of list) {
    const cp = hexToPixel(c.q, c.r); let score = 0;
    for (const o of w.players) if (o !== p && o.alive) {
      const d = Math.hypot(o.x - cp.x, o.y - cp.y);
      if (o.team === p.team) { if (d < p.radius * 3) score -= 1e6; }
      else score -= (hasLineOfSight(w, cp, o) ? 3 : 1) * 1e5 / Math.max(d, 1);
    }
    if (score > best) { best = score; s = c; }
  }
  const px = hexToPixel(s.q, s.r);
  Object.assign(p, { x: px.x, y: px.y, hp: p.maxHp, alive: true, spawnShieldLeft: w.classes._match.spawnShieldSec, charges: w.classes[p.cls].weapon.charges, chargeProgress: 0, salvo: null });
  w.events.push({ type: 'respawn', id: p.id });
}

export const isBlocking = (t) => t && (t.type === 'wall' || t.type === 'crate');
export function tileAt(w, x, y) { const h = pixelToHex(x, y); return w.tiles.get(key(h.q, h.r)); }
export function hexAt(w, x, y) { return pixelToHex(x, y); }
export function neighbors(w, q, r) {
  return DIRS.map(([dq, dr]) => w.tiles.get(key(q + dq, r + dr))).filter(t => t && t.type === 'floor').map(t => ({ q: t.q, r: t.r }));
}

// raycast i pixels. opts: { ignoreId, ignoreTeam, hitEntities=true }
export function raycast(w, from, dir, range, opts = {}) {
  const len = Math.hypot(dir.x, dir.y) || 1, dx = dir.x / len, dy = dir.y / len, step = 4;
  const hitEntities = opts.hitEntities !== false;
  for (let d = 0; d <= range; d += step) {
    const x = from.x + dx * d, y = from.y + dy * d, t = tileAt(w, x, y);
    if (!t || isBlocking(t)) return { hit: true, point: { x, y }, dist: d, tile: t ? { q: t.q, r: t.r, type: t.type } : null, entityId: null, team: null };
    if (hitEntities) for (const p of w.players) {
      if (!p.alive || p.id === opts.ignoreId || p.team === opts.ignoreTeam) continue;
      if (Math.hypot(p.x - x, p.y - y) <= p.radius) return { hit: true, point: { x, y }, dist: d, tile: null, entityId: p.id, team: p.team };
    }
  }
  return { hit: false, point: { x: from.x + dx * range, y: from.y + dy * range }, dist: range, tile: null, entityId: null, team: null };
}
export function hasLineOfSight(w, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return !raycast(w, a, { x: b.x - a.x, y: b.y - a.y }, d, { hitEntities: false }).hit;
}

// Cirkel mod hex-polygon: skub ud langs nærmeste kant, så man glider på hjørner.
function resolveCollision(w, p) {
  const h = pixelToHex(p.x, p.y);
  for (let it = 0; it < 2; it++) for (const [dq, dr] of [[0, 0], ...DIRS]) {
    const t = w.tiles.get(key(h.q + dq, h.r + dr));
    if (t && !isBlocking(t)) continue;
    const cs = hexCorners(h.q + dq, h.r + dr); let best = null;
    for (let i = 0; i < 6; i++) {
      const a = cs[i], b = cs[(i + 1) % 6], ex = b.x - a.x, ey = b.y - a.y;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)));
      const cx = a.x + ex * u, cy = a.y + ey * u, dd = Math.hypot(p.x - cx, p.y - cy);
      if (!best || dd < best.d) best = { d: dd, cx, cy };
    }
    const c = hexToPixel(h.q + dq, h.r + dr), inside = Math.hypot(p.x - c.x, p.y - c.y) < HEX_PX * 0.866;
    if (inside) { const nx = best.cx - c.x, ny = best.cy - c.y, n = Math.hypot(nx, ny) || 1; p.x = best.cx + nx / n * p.radius; p.y = best.cy + ny / n * p.radius; }
    else if (best.d < p.radius) { const nx = p.x - best.cx, ny = p.y - best.cy, n = best.d || 1; p.x = best.cx + nx / n * p.radius; p.y = best.cy + ny / n * p.radius; }
  }
}

function autoAimTarget(w, p, rangePx) {
  let best = null;
  for (const e of w.players) {
    if (!e.alive || e.team === p.team) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= rangePx && (!best || d < best.d) && hasLineOfSight(w, p, e)) best = { e, d };
  }
  return best && best.e;
}

const rad = (deg) => deg * Math.PI / 180, rnd = (s) => (Math.random() * 2 - 1) * s;

function fireShot(w, p) {
  const wp = w.classes[p.cls].weapon, s = p.salvo;
  for (let i = 0; i < wp.pellets; i++) {
    const spread = rad(s.auto ? wp.autoAimSpreadDeg : wp.spreadDeg);
    const a = Math.atan2(s.dir.y, s.dir.x) + (wp.pellets > 1 ? spread * (i / (wp.pellets - 1) - 0.5) + rnd(spread * 0.1) : rnd(spread / 2));
    const dir = { x: Math.cos(a), y: Math.sin(a) }, ox = p.x + dir.x * p.radius, oy = p.y + dir.y * p.radius;
    const range = wp.range * HEX_DIST;
    if (wp.projectileSpeed > 0) w.projectiles.push({ id: w.nextId++, owner: p.id, team: p.team, x: ox, y: oy, dir, speed: wp.projectileSpeed * HEX_DIST, left: range, damage: wp.damage });
    else { const hit = raycast(w, { x: ox, y: oy }, dir, range, { ignoreTeam: p.team }); applyHit(w, p.id, hit, wp.damage); w.events.push({ type: 'shot', id: p.id, from: { x: ox, y: oy }, to: hit.point, hitscan: true }); }
  }
  if (wp.projectileSpeed > 0) w.events.push({ type: 'shot', id: p.id, from: { x: p.x, y: p.y }, dir: s.dir });
}

function applyHit(w, ownerId, hit, damage) {
  if (!hit.hit) return;
  if (hit.entityId) {
    const t = w.players.find(q => q.id === hit.entityId);
    if (!t || !t.alive || t.spawnShieldLeft > 0) return;
    t.hp = Math.max(0, t.hp - damage);
    w.events.push({ type: 'hit', id: t.id, by: ownerId, damage, x: t.x, y: t.y, hp: t.hp });
    if (t.hp <= 0) {
      t.alive = false; t.deaths++; t.respawnLeft = w.classes._match.respawnSec;
      const k = w.players.find(q => q.id === ownerId); if (k) k.kills++;
      w.match.score[k ? k.team : (t.team === 'blue' ? 'red' : 'blue')]++;
      w.events.push({ type: 'kill', id: t.id, by: ownerId, x: t.x, y: t.y });
      if (w.match.score.blue >= w.classes._match.killTarget || w.match.score.red >= w.classes._match.killTarget) endMatch(w);
    }
  } else if (hit.tile && hit.tile.type === 'crate') {
    const t = w.tiles.get(key(hit.tile.q, hit.tile.r));
    t.hp -= damage; w.events.push({ type: 'crateDamaged', q: t.q, r: t.r, hp: t.hp, maxHp: t.maxHp });
    if (t.hp <= 0) { t.type = 'floor'; t.hp = 0; w.events.push({ type: 'crateBroken', q: t.q, r: t.r }); }
  }
}
function endMatch(w) { if (!w.match.over) { w.match.over = true; const s = w.match.score; w.events.push({ type: 'matchOver', winner: s.blue === s.red ? 'draw' : s.blue > s.red ? 'blue' : 'red' }); } }

// inputs: { [playerId]: InputFrame }  InputFrame = { move:{x,y}, aim:{x,y}|null, fire, ability, seq }
export function step(w, inputs) {
  w.events = []; w.tick++;
  if (!w.match.over) { w.match.timeLeft = Math.max(0, w.match.timeLeft - DT); if (w.match.timeLeft === 0) endMatch(w); }
  for (const p of w.players) {
    const c = w.classes[p.cls], wp = c.weapon, inp = inputs[p.id];
    if (!p.alive) { p.respawnLeft -= DT; if (p.respawnLeft <= 0 && !w.match.over) spawn(w, p); continue; }
    p.spawnShieldLeft = Math.max(0, p.spawnShieldLeft - DT);
    p.abilityCooldownLeft = Math.max(0, p.abilityCooldownLeft - DT);
    p.fireCooldownLeft = Math.max(0, p.fireCooldownLeft - DT);
    if (p.charges < wp.charges) { p.chargeProgress += DT / wp.rechargeSec; if (p.chargeProgress >= 1) { p.charges++; p.chargeProgress = p.charges < wp.charges ? p.chargeProgress - 1 : 0; } }
    if (!inp || w.match.over) continue;
    p.lastSeq = inp.seq ?? p.lastSeq;
    const m = inp.move || { x: 0, y: 0 }, ml = Math.min(1, Math.hypot(m.x, m.y)), mn = Math.hypot(m.x, m.y) || 1;
    const v = c.speed * HEX_DIST * DT * ml;
    p.x += m.x / mn * v; p.y += m.y / mn * v; resolveCollision(w, p);
    if (inp.aim && Math.hypot(inp.aim.x, inp.aim.y) > 0.01) p.aim = { x: inp.aim.x, y: inp.aim.y };
    if (inp.fire && !p.salvo && p.charges > 0 && p.fireCooldownLeft === 0) {
      let dir = inp.aim, auto = false;
      if (!dir) { const t = autoAimTarget(w, p, wp.range * HEX_DIST); dir = t ? { x: t.x - p.x, y: t.y - p.y } : p.aim; auto = true; }
      p.aim = dir; p.charges--; p.fireCooldownLeft = wp.fireCooldownSec; p.spawnShieldLeft = 0;
      p.salvo = { dir, auto, left: wp.shotsPerCharge, next: 0 };
    }
    // ability-systemet (granat m.fl.) kommer i milepæl 2; cooldown er allerede i state
  }
  for (const p of w.players) {
    if (!p.salvo || !p.alive) { p.salvo = null; continue; }
    p.salvo.next -= DT * 1000;
    while (p.salvo && p.salvo.next <= 0) { fireShot(w, p); p.salvo.left--; p.salvo.next += w.classes[p.cls].weapon.shotIntervalMs || 1e9; if (p.salvo.left <= 0) p.salvo = null; }
  }
  for (const b of w.projectiles) {
    const d = Math.min(b.speed * DT, b.left), hit = raycast(w, b, b.dir, d, { ignoreTeam: b.team });
    if (hit.hit) { applyHit(w, b.owner, hit, b.damage); b.left = 0; b.hitAt = hit.point; }
    else { b.x += b.dir.x * d; b.y += b.dir.y * d; b.left -= d; }
  }
  w.projectiles = w.projectiles.filter(b => b.left > 0);
}

// Snapshot til render, HUD og netværk (samme felter overalt)
export function snapshot(w) {
  return { tick: w.tick, match: { score: { ...w.match.score }, timeLeft: w.match.timeLeft, over: w.match.over },
    players: w.players.map(p => ({ id: p.id, team: p.team, cls: p.cls, x: p.x, y: p.y, aim: p.aim, alive: p.alive, hp: p.hp, maxHp: p.maxHp,
      charges: p.charges, chargeProgress: p.chargeProgress, abilityCooldownLeft: p.abilityCooldownLeft, spawnShieldLeft: p.spawnShieldLeft, respawnLeft: p.respawnLeft, lastSeq: p.lastSeq })),
    projectiles: w.projectiles.map(b => ({ id: b.id, team: b.team, x: b.x, y: b.y })), events: w.events };
}
