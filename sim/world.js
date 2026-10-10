// Ren simulation (ingen Phaser). Hosten kalder step(world, inputs) 20 gange i sekundet.
import { TILE_PX, DIRS4, DIRS8, key, tileToPixel, pixelToTile } from './grid.js';
const U = TILE_PX; // 1 tile i px
export const TICK_HZ = 20, DT = 1 / TICK_HZ;
const PLAYER_RADIUS = 0.4; // tiles, fallback hvis klassen ikke har radius
const CRATE_WARN_SEC = 1.5; // varsel før kasse-respawn (matcher FX.crateRespawn)

export function createWorld(map, classes) {
  const tiles = new Map(), crateHp = classes._match.crateHp ?? 100;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) tiles.set(key(x, y), { x, y, type: 'floor', hp: 0, maxHp: crateHp });
  for (const t of map.tiles) { const c = tiles.get(key(t.x, t.y)); if (!c) continue; c.type = t.type; if (t.type === 'crate') c.hp = crateHp; }
  return { map, classes, tiles, players: [], projectiles: [], grenades: [], zones: [], events: [], tick: 0,
    match: { score: { blue: 0, red: 0 }, timeLeft: classes._match.durationSec, over: false }, nextId: 1 };
}

export function addPlayer(w, { team, cls, id }) {
  const c = w.classes[cls], wp = c.weapon;
  const p = { id: id ?? 'p' + w.nextId++, team, cls, radius: (c.radius ?? PLAYER_RADIUS) * U,
    x: 0, y: 0, hp: c.hp, maxHp: c.hp, alive: true, aim: { x: 1, y: 0 },
    charges: wp.charges, chargeProgress: 0, fireCooldownLeft: 0, salvo: null,
    abilityCooldownLeft: 0, spawnShieldLeft: 0, invulnLeft: 0, focusLeft: 0, lastDamageAt: -1e9, deployedCrate: null, respawnLeft: 0, kills: 0, deaths: 0, lastSeq: 0 };
  w.players.push(p); spawn(w, p); return p;
}

function spawn(w, p) {
  // Ledig spawn længst fra synlige fjender (fjender uden synslinje tæller svagere)
  const list = w.map.spawns[p.team]; let s = list[0], best = -Infinity;
  for (const c of list) {
    const cp = tileToPixel(c.x, c.y); let score = 0;
    for (const o of w.players) if (o !== p && o.alive) {
      const d = Math.hypot(o.x - cp.x, o.y - cp.y);
      if (o.team === p.team) { if (d < p.radius * 3) score -= 1e6; }
      else score -= (hasLineOfSight(w, cp, o) ? 3 : 1) * 1e5 / Math.max(d, 1);
    }
    if (score > best) { best = score; s = c; }
  }
  const px = tileToPixel(s.x, s.y);
  Object.assign(p, { x: px.x, y: px.y, hp: p.maxHp, alive: true, spawnShieldLeft: w.classes._match.spawnShieldSec, charges: w.classes[p.cls].weapon.charges, chargeProgress: 0, salvo: null });
  w.events.push({ type: 'respawn', id: p.id });
}

export const isBlocking = (t) => t && (t.type === 'wall' || t.type === 'crate');
export function tileAt(w, px, py) { const t = pixelToTile(px, py); return w.tiles.get(key(t.x, t.y)); }
export { tileToPixel, pixelToTile };
const free = (w, x, y) => { const t = w.tiles.get(key(x, y)); return t && !isBlocking(t); };
// 8 retninger uden at skære hjørner: diagonalt kun når begge nabotiles er fri. cost: 1 eller √2
export function neighbors(w, x, y) {
  const out = [];
  for (const [dx, dy] of DIRS8) {
    if (!free(w, x + dx, y + dy)) continue;
    if (dx && dy && !(free(w, x + dx, y) && free(w, x, y + dy))) continue;
    out.push({ x: x + dx, y: y + dy, cost: dx && dy ? Math.SQRT2 : 1 });
  }
  return out;
}

// raycast i pixels. opts: { ignoreId, ignoreTeam, hitEntities=true }
export function raycast(w, from, dir, range, opts = {}) {
  const len = Math.hypot(dir.x, dir.y) || 1, dx = dir.x / len, dy = dir.y / len;
  // DDA gennem tiles til første væg/kasse eller range
  let tx = Math.floor(from.x / U), ty = Math.floor(from.y / U);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx ? Math.abs(U / dx) : Infinity, tdy = dy ? Math.abs(U / dy) : Infinity;
  let mx = dx ? ((dx > 0 ? (tx + 1) * U - from.x : from.x - tx * U) / Math.abs(dx)) : Infinity;
  let my = dy ? ((dy > 0 ? (ty + 1) * U - from.y : from.y - ty * U) / Math.abs(dy)) : Infinity;
  let wallD = range, wallTile = null, d = 0;
  const t0 = w.tiles.get(key(tx, ty));
  if (!t0 || isBlocking(t0)) { wallD = 0; wallTile = t0 || null; }
  else while (d <= range) {
    if (mx < my) { d = mx; mx += tdx; tx += sx; } else { d = my; my += tdy; ty += sy; }
    if (d > range) break;
    const t = w.tiles.get(key(tx, ty));
    if (!t || isBlocking(t)) { wallD = d; wallTile = t || null; break; }
  }
  // spillere: analytisk stråle mod cirkel, kun før væggen
  let best = null;
  if (opts.hitEntities !== false) for (const p of w.players) {
    if (!p.alive || p.id === opts.ignoreId || p.team === opts.ignoreTeam) continue;
    const ox = p.x - from.x, oy = p.y - from.y, b = ox * dx + oy * dy, c = ox * ox + oy * oy - p.radius * p.radius;
    const disc = b * b - c; if (disc < 0) continue;
    const t = c <= 0 ? 0 : b - Math.sqrt(disc);
    if (t >= 0 && t <= wallD && (!best || t < best.t)) best = { t, p };
  }
  const at = (t) => ({ x: from.x + dx * t, y: from.y + dy * t });
  if (best) return { hit: true, point: at(best.t), dist: best.t, tile: null, entityId: best.p.id, team: best.p.team };
  if (wallD < range || wallTile) return { hit: true, point: at(wallD), dist: wallD, tile: wallTile ? { x: wallTile.x, y: wallTile.y, type: wallTile.type } : null, entityId: null, team: null };
  return { hit: false, point: at(range), dist: range, tile: null, entityId: null, team: null };
}
export function hasLineOfSight(w, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return !raycast(w, a, { x: b.x - a.x, y: b.y - a.y }, d, { hitEntities: false }).hit;
}

// Cirkel mod kvadrat: skub ud fra nærmeste punkt på tilen, så man glider langs kanter og hjørner.
function resolveCollision(w, p) {
  for (let it = 0; it < 2; it++) {
    const cx = Math.floor(p.x / U), cy = Math.floor(p.y / U);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const t = w.tiles.get(key(xx, yy)); if (t && !isBlocking(t)) continue;
      const x0 = xx * U, y0 = yy * U, nx = Math.max(x0, Math.min(p.x, x0 + U)), ny = Math.max(y0, Math.min(p.y, y0 + U));
      const ddx = p.x - nx, ddy = p.y - ny, d = Math.hypot(ddx, ddy);
      if (d === 0) { // centrum inde i tilen: skub ud ad korteste akse
        const l = p.x - x0, r = x0 + U - p.x, tp = p.y - y0, b = y0 + U - p.y, m = Math.min(l, r, tp, b);
        if (m === l) p.x = x0 - p.radius; else if (m === r) p.x = x0 + U + p.radius; else if (m === tp) p.y = y0 - p.radius; else p.y = y0 + U + p.radius;
      } else if (d < p.radius) { p.x = nx + ddx / d * p.radius; p.y = ny + ddy / d * p.radius; }
    }
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
    const range = wp.range * U;
    const dmg = wp.damage * (s.focus ? s.focus.damageMult : 1), extra = s.focus ? { crit: true } : {};
    if (wp.projectileSpeed > 0) w.projectiles.push({ id: w.nextId++, owner: p.id, team: p.team, x: ox, y: oy, dir, speed: wp.projectileSpeed * U, left: range, damage: dmg, extra });
    else if (s.focus && s.focus.pierce) { // gennemborer spillere (ikke vægge/kasser)
      const wall = raycast(w, { x: ox, y: oy }, dir, range, { hitEntities: false });
      for (const t of w.players) { if (!t.alive || t.team === p.team) continue;
        const vx = t.x - ox, vy = t.y - oy, along = vx * dir.x + vy * dir.y; if (along < 0 || along > wall.dist) continue; if (Math.abs(vx * dir.y - vy * dir.x) <= t.radius) damagePlayer(w, p.id, t, dmg, extra); }
      if (wall.tile && wall.tile.type === 'crate') damageCrate(w, w.tiles.get(key(wall.tile.x, wall.tile.y)), dmg);
      w.events.push({ type: 'shot', id: p.id, from: { x: ox, y: oy }, to: wall.point, hitscan: true, crit: true });
    }
    else { const hit = raycast(w, { x: ox, y: oy }, dir, range, { ignoreTeam: p.team }); applyHit(w, p.id, hit, dmg, extra); w.events.push({ type: 'shot', id: p.id, from: { x: ox, y: oy }, to: hit.point, hitscan: true, ...extra }); }
  }
  if (wp.projectileSpeed > 0) w.events.push({ type: 'shot', id: p.id, from: { x: p.x, y: p.y }, dir: s.dir });
}

function applyHit(w, ownerId, hit, damage, extra = {}) {
  if (!hit.hit) return;
  if (hit.entityId) damagePlayer(w, ownerId, w.players.find(q => q.id === hit.entityId), damage, extra);
  else if (hit.tile && hit.tile.type === 'crate') damageCrate(w, w.tiles.get(key(hit.tile.x, hit.tile.y)), damage);
}
function damagePlayer(w, ownerId, t, damage, extra = {}) {
  if (!t || !t.alive || t.spawnShieldLeft > 0 || t.invulnLeft > 0) return;
  damage = Math.round(damage);
  t.hp = Math.max(0, t.hp - damage); t.lastDamageAt = w.tick * DT;
  w.events.push({ type: 'hit', id: t.id, by: ownerId, damage, x: t.x, y: t.y, hp: t.hp, ...extra });
  if (t.hp <= 0) {
    t.alive = false; t.deaths++; t.respawnLeft = w.classes._match.respawnSec;
    const k = w.players.find(q => q.id === ownerId); if (k && k.team !== t.team) k.kills++;
    w.match.score[k && k.team !== t.team ? k.team : (t.team === 'blue' ? 'red' : 'blue')]++;
    w.events.push({ type: 'kill', id: t.id, by: ownerId, x: t.x, y: t.y });
    if (w.match.score.blue >= w.classes._match.killTarget || w.match.score.red >= w.classes._match.killTarget) endMatch(w);
  }
}
function damageCrate(w, t, damage) {
  if (!t || t.type !== 'crate') return;
  t.hp -= damage; w.events.push({ type: 'crateDamaged', x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp });
  if (t.hp <= 0) {
    t.type = 'floor'; t.hp = 0; t.maxHp = w.classes._match.crateHp ?? 100;
    if (t.deployedBy) { const o = w.players.find(q => q.id === t.deployedBy); if (o && o.deployedCrate === t) o.deployedCrate = null; t.deployedBy = null; } // Engineer-kasser respawner ikke
    else { t.wasCrate = true; t.respawnLeft = w.classes._match.crateRespawnSec ?? Infinity; }
    w.events.push({ type: 'crateBroken', x: t.x, y: t.y });
  }
}

// ---------- Abilities ----------
// Sigte for abilities: aim = null giver auto (nærmeste synlige fjend / blikretning). aim-længde 0..1 skalerer kastelængde (granat); >1 tæller som 1.
function abilityDir(w, p, aim, rangePx) {
  if (aim && Math.hypot(aim.x, aim.y) > 0.01) return { dir: aim, frac: Math.min(1, Math.hypot(aim.x, aim.y)) };
  const t = autoAimTarget(w, p, rangePx);
  if (t) { const d = Math.hypot(t.x - p.x, t.y - p.y); return { dir: { x: t.x - p.x, y: t.y - p.y }, frac: Math.min(1, d / rangePx), target: t }; }
  return { dir: p.aim, frac: 1 };
}
const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
function useAbility(w, p, inp) {
  const ab = w.classes[p.cls].ability; if (!ab) return false;
  switch (ab.id) {
    case 'grenade': { // kastes over cover; landingspunkt clampes til banen
      const range = ab.throwRange * U, { dir, frac } = abilityDir(w, p, inp.aim, range), n = norm(dir);
      let to = { x: p.x + n.x * range * frac, y: p.y + n.y * range * frac };
      const tt = tileAt(w, to.x, to.y); if (!tt || tt.type === 'wall') to = raycast(w, p, n, range * frac, { hitEntities: false }).point;
      w.grenades.push({ id: w.nextId++, owner: p.id, team: p.team, from: { x: p.x, y: p.y }, x: to.x, y: to.y, fuse: ab.fuseSec, fuseSec: ab.fuseSec, damage: ab.damage, radius: ab.radius * U });
      w.events.push({ type: 'grenadeThrown', id: p.id, from: { x: p.x, y: p.y }, to, fuseSec: ab.fuseSec });
      return true;
    }
    case 'focus': p.focusLeft = ab.durationSec; w.events.push({ type: 'focus', id: p.id, durationSec: ab.durationSec }); return true;
    case 'dash': {
      const m = inp.move && Math.hypot(inp.move.x, inp.move.y) > 0.1 ? inp.move : (inp.aim || p.aim), n = norm(m), from = { x: p.x, y: p.y };
      const steps = Math.ceil(ab.distance * U / (p.radius * 0.5));
      for (let i = 0; i < steps; i++) { p.x += n.x * ab.distance * U / steps; p.y += n.y * ab.distance * U / steps; resolveCollision(w, p); }
      p.invulnLeft = ab.invulnSec;
      w.events.push({ type: 'dash', id: p.id, from, to: { x: p.x, y: p.y } }); return true;
    }
    case 'deploy_crate': {
      const n = norm(inp.aim || p.aim), cx = p.x + n.x * (p.radius + (ab.placeRange - 0.5) * U + U * 0.5), cy = p.y + n.y * (p.radius + (ab.placeRange - 0.5) * U + U * 0.5);
      const t = tileAt(w, cx, cy); if (!t || t.type !== 'floor' || t.warnLeft != null) return false;
      const x0 = t.x * U, y0 = t.y * U;
      if (w.players.some(q => q.alive && Math.hypot(q.x - Math.max(x0, Math.min(q.x, x0 + U)), q.y - Math.max(y0, Math.min(q.y, y0 + U))) < q.radius)) return false; // ingen fanget i kassen
      if (p.deployedCrate && p.deployedCrate.type === 'crate') { const o = p.deployedCrate; o.type = 'floor'; o.hp = 0; o.deployedBy = null; w.events.push({ type: 'crateBroken', x: o.x, y: o.y }); }
      Object.assign(t, { type: 'crate', hp: ab.crateHp, maxHp: ab.crateHp, deployedBy: p.id, wasCrate: false }); p.deployedCrate = t;
      w.events.push({ type: 'crateDeployed', id: p.id, x: t.x, y: t.y, hp: ab.crateHp }); return true;
    }
    case 'heal_zone': {
      w.zones.push({ id: w.nextId++, owner: p.id, team: p.team, x: p.x, y: p.y, radius: ab.radius * U, healPerSec: ab.healPerSec, left: ab.durationSec });
      w.events.push({ type: 'healZone', id: p.id, x: p.x, y: p.y, radius: ab.radius * U, durationSec: ab.durationSec }); return true;
    }
  }
  return false;
}
function stepAbilities(w) {
  for (const g of w.grenades) {
    g.fuse -= DT; if (g.fuse > 0) continue;
    const c = { x: g.x, y: g.y };
    w.events.push({ type: 'explosion', id: g.owner, x: g.x, y: g.y, radius: g.radius });
    for (const t of w.players) if (t.alive && t.team !== g.team && Math.hypot(t.x - g.x, t.y - g.y) <= g.radius + t.radius && hasLineOfSight(w, c, t)) damagePlayer(w, g.owner, t, g.damage);
    const r = Math.ceil(g.radius / U), ct = pixelToTile(g.x, g.y);
    for (let y = ct.y - r; y <= ct.y + r; y++) for (let x = ct.x - r; x <= ct.x + r; x++) { const t = w.tiles.get(key(x, y)); if (t && t.type === 'crate') { const tp = tileToPixel(x, y); if (Math.hypot(tp.x - g.x, tp.y - g.y) <= g.radius + U * 0.5) damageCrate(w, t, g.damage); } }
  }
  w.grenades = w.grenades.filter(g => g.fuse > 0);
  for (const z of w.zones) {
    z.left -= DT;
    for (const t of w.players) if (t.alive && t.team === z.team && Math.hypot(t.x - z.x, t.y - z.y) <= z.radius) t.hp = Math.min(t.maxHp, t.hp + z.healPerSec * DT);
  }
  w.zones = w.zones.filter(z => z.left > 0);
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
    p.invulnLeft = Math.max(0, p.invulnLeft - DT); p.focusLeft = Math.max(0, p.focusLeft - DT);
    const rg = w.classes._match; // valgfri regen uden for kamp: _match.regenDelaySec + regenPerSec
    if (rg.regenPerSec && w.tick * DT - p.lastDamageAt >= (rg.regenDelaySec ?? 3)) p.hp = Math.min(p.maxHp, p.hp + rg.regenPerSec * DT);
    if (p.charges < wp.charges) { p.chargeProgress += DT / wp.rechargeSec; if (p.chargeProgress >= 1) { p.charges++; p.chargeProgress = p.charges < wp.charges ? p.chargeProgress - 1 : 0; } }
    if (!inp || w.match.over) continue;
    p.lastSeq = inp.seq ?? p.lastSeq;
    const m = inp.move || { x: 0, y: 0 }, ml = Math.min(1, Math.hypot(m.x, m.y)), mn = Math.hypot(m.x, m.y) || 1;
    const v = c.speed * U * DT * ml;
    p.x += m.x / mn * v; p.y += m.y / mn * v; resolveCollision(w, p);
    if (inp.aim && Math.hypot(inp.aim.x, inp.aim.y) > 0.01) p.aim = { x: inp.aim.x, y: inp.aim.y };
    if (inp.fire && !p.salvo && p.charges > 0 && p.fireCooldownLeft === 0) {
      let dir = inp.aim, auto = false;
      if (!dir) { const t = autoAimTarget(w, p, wp.range * U); dir = t ? { x: t.x - p.x, y: t.y - p.y } : p.aim; auto = true; }
      p.aim = dir; p.charges--; p.fireCooldownLeft = wp.fireCooldownSec; p.spawnShieldLeft = 0;
      const ab = c.ability, focus = p.focusLeft > 0 && ab?.id === 'focus' ? { damageMult: ab.damageMult, pierce: ab.pierce } : null;
      if (focus) p.focusLeft = 0; // Fokus bruges af næste salve
      p.salvo = { dir, auto, left: wp.shotsPerCharge, next: 0, focus };
    }
    if (inp.ability && p.abilityCooldownLeft === 0 && c.ability && useAbility(w, p, inp)) { p.abilityCooldownLeft = c.ability.cooldownSec; p.spawnShieldLeft = 0; w.events.push({ type: 'ability', id: p.id, ability: c.ability.id }); }
  }
  for (const p of w.players) {
    if (!p.salvo || !p.alive) { p.salvo = null; continue; }
    p.salvo.next -= DT * 1000;
    while (p.salvo && p.salvo.next <= 0) { fireShot(w, p); p.salvo.left--; p.salvo.next += w.classes[p.cls].weapon.shotIntervalMs || 1e9; if (p.salvo.left <= 0) p.salvo = null; }
  }
  for (const b of w.projectiles) {
    const d = Math.min(b.speed * DT, b.left), hit = raycast(w, b, b.dir, d, { ignoreTeam: b.team });
    if (hit.hit) { applyHit(w, b.owner, hit, b.damage, b.extra); b.left = 0; b.hitAt = hit.point; }
    else { b.x += b.dir.x * d; b.y += b.dir.y * d; b.left -= d; }
  }
  w.projectiles = w.projectiles.filter(b => b.left > 0);
  stepAbilities(w);
  // Kasse-respawn: kun når ingen spiller står inden for crateRespawnBlockRadius tiles
  const blockPx = ((w.classes._match.crateRespawnBlockRadius ?? 1) + 0.5) * U;
  for (const t of w.tiles.values()) {
    if (!t.wasCrate || t.type !== 'floor') continue;
    t.respawnLeft -= DT; if (t.respawnLeft > 0) continue;
    const c = tileToPixel(t.x, t.y), blocked = w.players.some(p => p.alive && Math.hypot(p.x - c.x, p.y - c.y) < blockPx);
    if (t.warnLeft == null) {          // fase 1: varsel, når pladsen er fri
      if (!blocked) { t.warnLeft = CRATE_WARN_SEC; w.events.push({ type: 'crateRespawnWarning', x: t.x, y: t.y, sec: CRATE_WARN_SEC }); }
      continue;
    }
    t.warnLeft -= DT; if (t.warnLeft > 0) continue;
    if (blocked) { t.warnLeft = null; w.events.push({ type: 'crateRespawnCancelled', x: t.x, y: t.y }); continue; } // nogen gik ind i spøgelset: prøv igen
    t.type = 'crate'; t.hp = t.maxHp; t.wasCrate = false; t.warnLeft = null;
    w.events.push({ type: 'crateRespawned', x: t.x, y: t.y });
  }
}

// Snapshot til render, HUD og netværk (samme felter overalt)
export function snapshot(w) {
  return { tick: w.tick, match: { score: { ...w.match.score }, timeLeft: w.match.timeLeft, over: w.match.over },
    players: w.players.map(p => ({ id: p.id, team: p.team, cls: p.cls, radius: p.radius, x: p.x, y: p.y, aim: p.aim, alive: p.alive, hp: p.hp, maxHp: p.maxHp,
      charges: p.charges, chargeProgress: p.chargeProgress, abilityCooldownLeft: p.abilityCooldownLeft, spawnShieldLeft: p.spawnShieldLeft, invulnLeft: p.invulnLeft, focusLeft: p.focusLeft, respawnLeft: p.respawnLeft, lastSeq: p.lastSeq })),
    projectiles: w.projectiles.map(b => ({ id: b.id, team: b.team, x: b.x, y: b.y })),
    grenades: w.grenades.map(g => ({ id: g.id, team: g.team, from: g.from, x: g.x, y: g.y, fuse: g.fuse, fuseSec: g.fuseSec, radius: g.radius })),
    zones: w.zones.map(z => ({ id: z.id, team: z.team, x: z.x, y: z.y, radius: z.radius, left: z.left })), events: w.events };
}
