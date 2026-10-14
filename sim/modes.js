// Spiltilstande med respawn: tdm, kc (Kill Confirmed), dom (Domination), hp (Hardpoint), hq (Headquarters). knockout ligger i world.js.
// Objektiver ligger i banefilen som zones: [{id, x, y, w, h}] (felter); mangler de, lægges de automatisk ud fra banens midte.
// Hardpoint/Headquarters bruger én aktiv zone ad gangen (rækkefølgen i listen). Klienten regner samme layout ud fra banen.
import { TILE_PX as U } from './grid.js';

export const MODE_IDS = ['tdm', 'knockout', 'kc', 'dom', 'hp', 'hq']; // indeks bruges i codec (0/1 = gammelt format)
export const MODE_DEFAULTS = {
  knockout: {},
  tdm: { scoreTarget: 30, timeSec: 480, respawnSec: 3 },
  kc: { scoreTarget: 30, timeSec: 480, respawnSec: 3, tagLifeSec: 30 },
  dom: { scoreTarget: 200, timeSec: 600, respawnSec: 3, capSec: 5 },
  hp: { scoreTarget: 150, timeSec: 600, respawnSec: 3, capSec: 0, rotateSec: 60 },
  hq: { scoreTarget: 200, timeSec: 600, respawnSec: 3, capSec: 6, moveDelaySec: 5 },
};
export const isObjMode = (mode) => mode === 'dom' || mode === 'hp' || mode === 'hq';

// Automatiske zoner: 3×3 felter på midterlinjen (B) og i hver tredjedel (A/C), flyttet til nærmeste plet med mest gulv.
export function layoutObjectives(map, mode) {
  if (!isObjMode(mode)) return [];
  let list = map.zones?.length ? map.zones.map(z => ({ id: z.id, x: z.x, y: z.y, w: z.w ?? 3, h: z.h ?? 3 })) : null;
  if (!list) {
    const W = map.width, H = map.height, solid = new Set(map.tiles.map(t => t.x + ',' + t.y));
    const free = (x, y) => { let n = 0; for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const tx = x + dx, ty = y + dy; if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1 && !solid.has(tx + ',' + ty)) n++; } return n; };
    const place = (id, cx, cy) => { let best = null; for (let r = 0; r < 6 && !(best && best.n === 9); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(cx - 1.5) + dx, y = Math.round(cy - 1.5) + dy, n = free(x, y); if (!best || n > best.n) best = { x, y, n }; } return { id, x: best.x, y: best.y, w: 3, h: 3 }; };
    // punktsymmetriske baner: A og C spejles gennem midten
    const a = place('A', W * 0.25, H * 0.5), c = { id: 'C', x: W - a.x - 3, y: H - a.y - 3, w: 3, h: 3 }, b = place('B', W / 2, H / 2);
    list = mode === 'hq' ? [b, a, c] : mode === 'hp' ? [b, a, c] : [a, b, c];
  }
  return list.map(z => ({ ...z, owner: null, cap: 0, capTeam: null }));
}

export function initMode(w) {
  const m = w.match; m.objectives = layoutObjectives(w.map, m.mode); m.tags = []; m.active = 0; m.respawnBlocked = null;
  m.zoneSwapLeft = m.mode === 'hp' ? m.cfg.rotateSec : 0; m.scoreAcc = { blue: 0, red: 0 }; m.tagSeq = 1;
}

const inZone = (p, z) => p.x >= z.x * U && p.x < (z.x + z.w) * U && p.y >= z.y * U && p.y < (z.y + z.h) * U;
const other = (t) => t === 'blue' ? 'red' : 'blue';

// Kald hvert tick (efter bevægelse), når kampen er i gang. Returnerer evt. vinder via score.
export function stepMode(w, DT) {
  const m = w.match, cfg = m.cfg; if (m.over) return;
  const add = (team, pts) => { m.scoreAcc[team] += pts; const whole = Math.floor(m.scoreAcc[team]); if (whole) { m.scoreAcc[team] -= whole; m.score[team] += whole; } };
  if (m.mode === 'kc') {
    for (const t of m.tags) t.left -= DT;
    m.tags = m.tags.filter(t => t.left > 0 && !w.players.some(p => {
      if (!p.alive || Math.hypot(p.x - t.x, p.y - t.y) > p.radius + U * 0.45) return false;
      if (p.team !== t.team) add(p.team, 1);
      w.events.push({ type: 'tag', id: p.id, team: p.team, confirmed: p.team !== t.team, x: t.x, y: t.y, score: { ...m.score } }); return true;
    }));
  }
  if (isObjMode(m.mode)) {
    const zs = m.mode === 'dom' ? m.objectives : [m.objectives[m.active % m.objectives.length]];
    for (const z of zs) {
      const n = { blue: 0, red: 0 }; for (const p of w.players) if (p.alive && inZone(p, z)) n[p.team]++;
      const solo = n.blue && !n.red ? 'blue' : n.red && !n.blue ? 'red' : null;
      if (m.mode === 'hp') { z.owner = solo; z.capTeam = solo; z.cap = solo ? 1 : 0; if (solo) add(solo, DT); continue; }
      // dom/hq: indtag (neutralisér først, hvis en anden ejer den)
      if (solo && z.owner !== solo) {
        const rate = DT / (cfg.capSec || 5) * Math.min(3, n[solo]) ** 0.5;
        if (z.owner && z.capTeam !== solo) { z.cap = Math.max(0, z.cap - rate); if (z.cap === 0) { w.events.push({ type: 'zoneLost', zone: z.id, team: z.owner }); z.owner = null; z.capTeam = solo; } }
        else { z.capTeam = solo; z.cap = Math.min(1, z.cap + rate); if (z.cap >= 1) { z.owner = solo; w.events.push({ type: 'zoneCaptured', zone: z.id, team: solo }); } }
      } else if (!n.blue && !n.red && z.owner && z.cap < 1) z.cap = Math.min(1, z.cap + DT / (cfg.capSec || 5)); // ejer genvinder halvt indtaget zone
      else if (!n.blue && !n.red && !z.owner && z.cap > 0) { z.cap = Math.max(0, z.cap - DT / (cfg.capSec || 5)); if (!z.cap) z.capTeam = null; }
      if (z.owner) add(z.owner, DT);
    }
    if (m.mode === 'hp') { m.zoneSwapLeft -= DT; if (m.zoneSwapLeft <= 0) { m.active++; m.zoneSwapLeft = cfg.rotateSec; w.events.push({ type: 'zoneMoved', zone: m.objectives[m.active % m.objectives.length].id }); } }
    if (m.mode === 'hq') {
      const z = zs[0];
      m.respawnBlocked = z.owner;
      // basen falder, når hele ejerholdet er ude: neutral, og den flytter efter moveDelaySec
      if (z.owner && !w.players.some(p => p.team === z.owner && p.alive)) {
        w.events.push({ type: 'hqDestroyed', zone: z.id, team: z.owner }); z.owner = null; z.cap = 0; z.capTeam = null; m.respawnBlocked = null; m.zoneSwapLeft = cfg.moveDelaySec;
      }
      if (m.zoneSwapLeft > 0) { m.zoneSwapLeft -= DT; if (m.zoneSwapLeft <= 0) { m.zoneSwapLeft = 0; m.active++; w.events.push({ type: 'zoneMoved', zone: m.objectives[m.active % m.objectives.length].id }); } }
    }
  }
  if (m.score.blue >= cfg.scoreTarget || m.score.red >= cfg.scoreTarget) return true;
}

// Ved drab: tdm tæller drab; kc lægger en brik; de andre tilstande giver ikke point for drab.
export function onKillMode(w, victim, killerTeam) {
  const m = w.match;
  if (m.mode === 'tdm') m.score[killerTeam]++;
  else if (m.mode === 'kc') m.tags.push({ id: m.tagSeq++, x: victim.x, y: victim.y, team: victim.team, left: m.cfg.tagLifeSec ?? 30 });
}
export const respawnBlocked = (w, p) => w.match.respawnBlocked === p.team;
export { other };
