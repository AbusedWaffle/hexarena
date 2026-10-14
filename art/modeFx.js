import { PALETTE } from './palette.js';
import { TILE_PX } from '../sim/grid.js';

// Grafik for spiltilstande: zoner (A/B/C, Hardpoint), hovedkvarter (HQ) og mærke-brikker (Kill Confirmed).
// Tegnes under figurerne ud fra snapshot.objectives (felter) og snapshot.tags (pixels).
const NEUTRAL = 0x8A93B0;
const col = (t) => t === 'blue' ? PALETTE.blue : t === 'red' ? PALETTE.red : NEUTRAL;
const glw = (t) => t === 'blue' ? PALETTE.blueGlow : t === 'red' ? PALETTE.redGlow : 0xC9D0E6;

export class ModeFx {
  constructor(scene) { this.scene = scene; this.labels = new Map(); }

  draw(g, now, snap) {
    const T = TILE_PX, mode = snap?.match?.mode, seen = new Set();
    for (const z of snap?.objectives || []) {
      const x = z.x * T, y = z.y * T, w = z.w * T, h = z.h * T, cx = x + w / 2, cy = y + h / 2;
      const a = z.active === false ? 0.25 : 1, c = col(z.owner), gl = glw(z.owner);
      const contested = z.capTeam && z.capTeam !== z.owner && z.cap > 0;
      // Gulv og kant
      g.fillStyle(c, 0.10 * a).fillRect(x, y, w, h);
      const pulse = contested ? 0.6 + 0.4 * Math.sin(now / 120) : 1;
      g.lineStyle(3, gl, 0.7 * a * pulse).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      // Indtagelse: kanten fyldes rundt med indtagerens farve
      if (contested) this.edgeProgress(g, x, y, w, h, z.cap, glw(z.capTeam), a);
      if (mode === 'hq') this.drawHQ(g, cx, cy, T, c, gl, a, now);
      // Bogstav
      seen.add(z.id);
      let t = this.labels.get(z.id);
      if (!t) { t = this.scene.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: Math.round(T * 0.9) + 'px', color: '#ffffff' }).setOrigin(0.5).setDepth(1); this.labels.set(z.id, t); }
      const label = mode === 'hq' ? '' : mode === 'hp' ? (z.active ? '◆' : '') : String(z.id);
      t.setText(label).setPosition(cx, mode === 'hq' ? cy : cy).setAlpha(0.35 * a + 0.2).setTint(gl);
    }
    for (const [id, t] of this.labels) if (!seen.has(id)) { t.destroy(); this.labels.delete(id); }
    // Mærke-brikker: ruder i offerets farve, svag pulsering og svæv
    for (const k of snap?.tags || []) {
      const c = col(k.team), gl = glw(k.team), s = T * 0.22 * (1 + 0.12 * Math.sin(now / 200 + k.id)), y = k.y + Math.sin(now / 300 + k.id) * 3;
      const d = (q) => [{ x: k.x, y: y - q }, { x: k.x + q, y }, { x: k.x, y: y + q }, { x: k.x - q, y }];
      g.fillStyle(gl, 0.3).fillPoints(d(s * 1.6), true).fillStyle(c).fillPoints(d(s), true).lineStyle(2, 0xffffff, 0.8).strokePoints(d(s), true);
    }
  }

  edgeProgress(g, x, y, w, h, p, c, a) {
    const per = 2 * (w + h); let L = per * Math.min(1, p);
    const segs = [[x, y, w, 0], [x + w, y, 0, h], [x + w, y + h, -w, 0], [x, y + h, 0, -h]];
    g.lineStyle(5, c, a);
    for (const [sx, sy, dx, dy] of segs) {
      const len = Math.abs(dx + dy), k = Math.min(1, L / len); if (k <= 0) break;
      g.lineBetween(sx, sy, sx + dx * k, sy + dy * k); L -= len;
    }
  }

  drawHQ(g, cx, cy, T, c, gl, a, now) {
    const s = T * 0.55;
    g.fillStyle(gl, 0.25 * a).fillRect(cx - s - 4, cy - s - 4, 2 * s + 8, 2 * s + 8);
    g.fillStyle(c, a).fillRect(cx - s, cy - s, 2 * s, 2 * s).lineStyle(2, gl, a).strokeRect(cx - s, cy - s, 2 * s, 2 * s);
    // Antenne med radiobølger
    g.lineStyle(3, 0xffffff, a).lineBetween(cx, cy + s * 0.5, cx, cy - s * 0.6).fillStyle(0xffffff, a).fillCircle(cx, cy - s * 0.6, 3);
    const k = (now % 1200) / 1200;
    g.lineStyle(2, gl, (1 - k) * a).strokeCircle(cx, cy - s * 0.6, 6 + k * T * 0.8);
  }

  destroy() { for (const t of this.labels.values()) t.destroy(); this.labels.clear(); }
}
