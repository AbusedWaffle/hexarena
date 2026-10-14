// Kompakt netværksformat for snapshots (unreliable kanal, 20 Hz). Mål: < 600 bytes som JSON.
// Spillere refereres med indeks i rosteren, som sendes over den reliable kanal.
import { MODE_IDS, layoutObjectives } from '../sim/modes.js';
const q10 = (v) => Math.round(v * 10), deg = (a) => a ? (Math.round(Math.atan2(a.y, a.x) * 180 / Math.PI) + 360) % 360 : 0;
// players: [x, y, aimDeg*360 + facingDeg, hp, alive, charges*100 + chargeProgress%, lastSeq, abilityCD*10, shield*10, invuln*10, focus*10, respawn*10] (afsluttende nuller udelades)
// view = { x, y, rx, ry } (px): kun spillere/skud/granater/zoner/brikker inden for kameraets område (+margen) sendes; p bliver tæt med indeks-liste pi.
const inView = (v, o) => !v || (Math.abs(o.x - v.x) <= v.rx && Math.abs(o.y - v.y) <= v.ry);
// i store slagsmål: de nærmeste (egen spiller altid med)
const nearest = (v, arr, n) => arr.length <= n ? arr : arr.map(o => [o.id === v.id ? -1 : Math.hypot(o.x - v.x, o.y - v.y), o]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
export function encodeSnap(snap0, roster, view = null) {
  const snap = view ? { ...snap0, players: nearest(view, snap0.players.filter(p => p.id === view.id || inView(view, p)), view.maxPlayers ?? 14), projectiles: nearest(view, snap0.projectiles.filter(b => inView(view, b)), view.maxShots ?? 16),
    grenades: (snap0.grenades || []).filter(g => inView(view, g)), zones: (snap0.zones || []).filter(z => inView(view, z)), tags: (snap0.tags || []).filter(t => inView(view, t)) } : snap0;
  const idx = new Map(roster.map((r, i) => [r.id, i]));
  const P = [], PI = [];
  for (const p of snap.players) {
    const i = idx.get(p.id); if (i == null) continue;
    const arr = [Math.round(p.x), Math.round(p.y), deg(p.aim) * 360 + deg({ x: Math.cos(p.facing || 0), y: Math.sin(p.facing || 0) }), Math.ceil(p.hp), p.alive ? 1 : 0, p.charges * 100 + Math.min(99, Math.floor(p.chargeProgress * 100)), p.lastSeq | 0,
      q10(p.abilityCooldownLeft), q10(p.spawnShieldLeft), q10(p.invulnLeft || 0), q10(p.focusLeft || 0), q10(Math.min(99, Math.max(0, p.respawnLeft)))];
    while (arr.length > 7 && arr[arr.length - 1] === 0) arr.pop(); // nul-felter til sidst sendes ikke
    if (view) { PI.push(i); P.push(arr); } else P[i] = arr;
  }
  const tm = { blue: 0, red: 1 };
  const out = { t: snap.tick, m: [snap.match.score.blue, snap.match.score.red, q10(snap.match.timeLeft), snap.match.over ? 1 : 0, snap.match.round ?? 1, q10(snap.match.roundIntroLeft ?? 0), Math.max(0, MODE_IDS.indexOf(snap.match.mode))], p: P,
    b: snap.projectiles.flatMap(b => [b.id, Math.round(b.x), Math.round(b.y), tm[b.team]]),
    g: (snap.grenades || []).map(g => [g.id, tm[g.team], Math.round(g.from.x), Math.round(g.from.y), Math.round(g.x), Math.round(g.y), q10(g.fuse), q10(g.fuseSec), Math.round(g.radius)]),
    z: (snap.zones || []).map(z => [z.id, tm[z.team], Math.round(z.x), Math.round(z.y), Math.round(z.radius), q10(z.left)]) };
  // tilstande med respawn: m += [target, zoneSwap*10, respawnBlocked(0/1=blå/2=rød), aktiv zone]; o = [ejer, indtager, cap%] pr. objektiv (geometri regnes ud fra banen); k = brikker [id, x, y, hold]
  const M = snap.match, t3 = (t) => t === 'blue' ? 1 : t === 'red' ? 2 : 0;
  if (view) out.pi = PI;
  if (M.mode !== 'knockout') out.m.push(M.target ?? 0, q10(M.zoneSwapLeft || 0), t3(M.respawnBlocked), M.active || 0);
  if (snap.objectives?.length) out.o = snap.objectives.flatMap(z => [t3(z.owner), t3(z.capTeam), Math.round(z.cap * 100)]);
  if (snap.tags?.length) out.k = snap.tags.flatMap(t => [t.id, Math.round(t.x), Math.round(t.y), tm[t.team]]);
  return out;
}
// remap: id -> id i klientens view (egen spiller bliver 'me', så render/HUD virker uændret)
const layoutCache = new Map();
export function decodeSnap(m, roster, remap = (id) => id, map = null) {
  const teams = ['blue', 'red'], players = [];
  m.p.forEach((a, i) => {
    const r = roster[m.pi ? m.pi[i] : i]; if (!a || !r) return; // roster kan være skiftet i lobbyen før næste roster-besked
    players.push({ id: remap(r.id), team: r.team, cls: r.cls, radius: r.radius, x: a[0], y: a[1], aim: { x: Math.cos(Math.floor(a[2] / 360) * Math.PI / 180), y: Math.sin(Math.floor(a[2] / 360) * Math.PI / 180) }, facing: (a[2] % 360) * Math.PI / 180,
      alive: !!a[4], hp: a[3], maxHp: r.maxHp, charges: Math.floor(a[5] / 100), chargeProgress: (a[5] % 100) / 100,
      lastSeq: a[6], abilityCooldownLeft: (a[7] ?? 0) / 10, spawnShieldLeft: (a[8] ?? 0) / 10, invulnLeft: (a[9] ?? 0) / 10, focusLeft: (a[10] ?? 0) / 10, respawnLeft: (a[11] ?? 0) / 10 });
  });
  const projectiles = []; for (let i = 0; i < m.b.length; i += 4) projectiles.push({ id: m.b[i], x: m.b[i + 1], y: m.b[i + 2], team: teams[m.b[i + 3]] });
  const mode = MODE_IDS[m.m[6]] || 'tdm', T = [null, 'blue', 'red'], objectives = [], tags = [];
  if (m.o && map) {
    const ck = map.id + '|' + mode; if (!layoutCache.has(ck)) layoutCache.set(ck, layoutObjectives(map, mode));
    const L = layoutCache.get(ck), act = m.m[10] || 0;
    L.forEach((z, i) => objectives.push({ id: z.id, x: z.x, y: z.y, w: z.w, h: z.h, owner: T[m.o[i * 3]], capTeam: T[m.o[i * 3 + 1]], cap: (m.o[i * 3 + 2] || 0) / 100, active: mode === 'dom' || act % L.length === i }));
  }
  if (m.k) for (let i = 0; i < m.k.length; i += 4) tags.push({ id: m.k[i], x: m.k[i + 1], y: m.k[i + 2], team: teams[m.k[i + 3]] });
  return { tick: m.t, match: { score: { blue: m.m[0], red: m.m[1] }, timeLeft: m.m[2] / 10, over: !!m.m[3], round: m.m[4], roundIntroLeft: m.m[5] / 10, mode,
    target: m.m[7] ?? null, zoneSwapLeft: (m.m[8] || 0) / 10, respawnBlocked: [null, 'blue', 'red'][m.m[9] || 0], active: m.m[10] || 0 }, players, projectiles,
    grenades: m.g.map(g => ({ id: g[0], team: teams[g[1]], from: { x: g[2], y: g[3] }, x: g[4], y: g[5], fuse: g[6] / 10, fuseSec: g[7] / 10, radius: g[8] })),
    zones: m.z.map(z => ({ id: z[0], team: teams[z[1]], x: z[2], y: z[3], radius: z[4], left: z[5] / 10 })), events: [], objectives, tags };
}
export const rosterOf = (w) => w.players.map(p => ({ id: p.id, team: p.team, cls: p.cls, radius: p.radius, maxHp: p.maxHp, name: p.name || null }));
// Event-id'er remappes også, så 'me' altid er klientens egen spiller
export function remapEvent(e, remap) { const o = { ...e }; for (const k of ['id', 'by']) if (typeof o[k] === 'string') o[k] = remap(o[k]); return o; }
