// Kompakt netværksformat for snapshots (unreliable kanal, 20 Hz). Mål: < 600 bytes som JSON.
// Spillere refereres med indeks i rosteren, som sendes over den reliable kanal.
const q10 = (v) => Math.round(v * 10), deg = (a) => a ? (Math.round(Math.atan2(a.y, a.x) * 180 / Math.PI) + 360) % 360 : 0;
// players: [x, y, aimDeg, hp, flags(1=alive), charges*100 + chargeProgress%, abilityCD*10, shield*10, invuln*10, focus*10, respawn*10, lastSeq]
export function encodeSnap(snap, roster) {
  const idx = new Map(roster.map((r, i) => [r.id, i]));
  const P = [];
  for (const p of snap.players) {
    const i = idx.get(p.id); if (i == null) continue;
    P[i] = [Math.round(p.x), Math.round(p.y), deg(p.aim), Math.ceil(p.hp), p.alive ? 1 : 0, p.charges * 100 + Math.min(99, Math.floor(p.chargeProgress * 100)),
      q10(p.abilityCooldownLeft), q10(p.spawnShieldLeft), q10(p.invulnLeft || 0), q10(p.focusLeft || 0), q10(Math.max(0, p.respawnLeft)), p.lastSeq | 0];
  }
  const tm = { blue: 0, red: 1 };
  return { t: snap.tick, m: [snap.match.score.blue, snap.match.score.red, q10(snap.match.timeLeft), snap.match.over ? 1 : 0], p: P,
    b: snap.projectiles.flatMap(b => [b.id, Math.round(b.x), Math.round(b.y), tm[b.team]]),
    g: (snap.grenades || []).map(g => [g.id, tm[g.team], Math.round(g.from.x), Math.round(g.from.y), Math.round(g.x), Math.round(g.y), q10(g.fuse), q10(g.fuseSec), Math.round(g.radius)]),
    z: (snap.zones || []).map(z => [z.id, tm[z.team], Math.round(z.x), Math.round(z.y), Math.round(z.radius), q10(z.left)]) };
}
// remap: id -> id i klientens view (egen spiller bliver 'me', så render/HUD virker uændret)
export function decodeSnap(m, roster, remap = (id) => id) {
  const teams = ['blue', 'red'], players = [];
  m.p.forEach((a, i) => {
    if (!a) return; const r = roster[i];
    players.push({ id: remap(r.id), team: r.team, cls: r.cls, radius: r.radius, x: a[0], y: a[1], aim: { x: Math.cos(a[2] * Math.PI / 180), y: Math.sin(a[2] * Math.PI / 180) },
      alive: !!a[4], hp: a[3], maxHp: r.maxHp, charges: Math.floor(a[5] / 100), chargeProgress: (a[5] % 100) / 100,
      abilityCooldownLeft: a[6] / 10, spawnShieldLeft: a[7] / 10, invulnLeft: a[8] / 10, focusLeft: a[9] / 10, respawnLeft: a[10] / 10, lastSeq: a[11] });
  });
  const projectiles = []; for (let i = 0; i < m.b.length; i += 4) projectiles.push({ id: m.b[i], x: m.b[i + 1], y: m.b[i + 2], team: teams[m.b[i + 3]] });
  return { tick: m.t, match: { score: { blue: m.m[0], red: m.m[1] }, timeLeft: m.m[2] / 10, over: !!m.m[3] }, players, projectiles,
    grenades: m.g.map(g => ({ id: g[0], team: teams[g[1]], from: { x: g[2], y: g[3] }, x: g[4], y: g[5], fuse: g[6] / 10, fuseSec: g[7] / 10, radius: g[8] })),
    zones: m.z.map(z => ({ id: z[0], team: teams[z[1]], x: z[2], y: z[3], radius: z[4], left: z[5] / 10 })), events: [] };
}
export const rosterOf = (w) => w.players.map(p => ({ id: p.id, team: p.team, cls: p.cls, radius: p.radius, maxHp: p.maxHp, name: p.name || null }));
// Event-id'er remappes også, så 'me' altid er klientens egen spiller
export function remapEvent(e, remap) { const o = { ...e }; for (const k of ['id', 'by']) if (typeof o[k] === 'string') o[k] = remap(o[k]); return o; }
