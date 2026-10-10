import { PALETTE, FX } from './palette.js';

// Ability-grafik. Lytter på sim-events og tegner ud fra snapshot-felterne (zones, grenades, focusLeft, invulnLeft).
const A = FX.abilities;
const teamGlow = t => t === 'blue' ? PALETTE.blueGlow : PALETTE.redGlow;
const teamCol = t => t === 'blue' ? PALETTE.blue : PALETTE.red;

export class AbilityFx {
  constructor(scene) { this.s = scene; this.booms = []; this.debris = []; this.dashes = []; this.healPlus = []; }

  onEvent(e, cur) {
    const now = this.s.time.now, owner = cur.players.find(p => p.id === e.id);
    if (e.type === 'explosion') {
      const team = owner?.team ?? 'red';
      this.booms.push({ ...e, team, born: now });
      for (let i = 0; i < A.explosion.debris; i++) { const a = Math.random() * 6.28, v = A.explosion.debrisSpeed * (0.5 + Math.random() * 0.5); this.debris.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: teamGlow(team), born: now }); }
      const me = cur.players.find(p => p.id === 'me');
      if (me && Math.hypot(me.x - e.x, me.y - e.y) < e.radius * 2.5) this.s.cameras.main.shake(A.explosion.shakeMs, A.explosion.shake / 1000);
    }
    if (e.type === 'dash' && owner) this.dashes.push({ ...e, team: owner.team, cls: owner.cls, r: owner.radius, born: now });
    if (e.type === 'crateDeployed') this.s.pops?.push({ x: e.x, y: e.y, born: now });
  }

  draw(g, now, cur, drawUnitFn, classes) {
    // Heal-zone: pulserende fyld, roterende stiplet ring, plusser der stiger op
    for (const z of cur.zones || []) {
      const fade = Math.min(1, z.left / A.heal.fadeSec), rot = now / 1000 * A.heal.ringSpin;
      g.fillStyle(PALETTE.heal, (0.08 + 0.04 * Math.sin(now / 250)) * fade).fillCircle(z.x, z.y, z.radius);
      g.lineStyle(2, PALETTE.heal, 0.7 * fade);
      for (let i = 0; i < A.heal.dashes; i++) { const a0 = rot + i * 6.283 / A.heal.dashes; g.beginPath(); g.arc(z.x, z.y, z.radius, a0, a0 + 6.283 / A.heal.dashes * 0.55); g.strokePath(); }
      if (Math.random() < A.heal.plusRate) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * z.radius * 0.9; this.healPlus.push({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, born: now }); }
    }
    this.healPlus = this.healPlus.filter(p => now - p.born < A.heal.plusMs);
    for (const p of this.healPlus) { const k = (now - p.born) / A.heal.plusMs, y = p.y - k * 18, s = 4; g.fillStyle(PALETTE.heal, 0.8 * (1 - k)).fillRect(p.x - s, y - 1.5, s * 2, 3).fillRect(p.x - 1.5, y - s, 3, s * 2); }

    // Granat: målring der fyldes efterhånden som lunten brænder, skygge på jorden og bue i luften
    for (const gr of cur.grenades || []) {
      const k = 1 - gr.fuse / gr.fuseSec, f = Math.min(1, k * A.grenade.flightShare), c = teamGlow(gr.team);
      const gx = gr.from.x + (gr.x - gr.from.x) * f, gy = gr.from.y + (gr.y - gr.from.y) * f, h = Math.sin(f * Math.PI) * A.grenade.arcPx;
      const blink = k > 0.7 ? (Math.sin(now / 40) > 0 ? 1 : 0.3) : 1;
      g.fillStyle(c, 0.08 + 0.12 * k).fillCircle(gr.x, gr.y, gr.radius);
      g.lineStyle(2, c, 0.7 * blink); g.beginPath(); g.arc(gr.x, gr.y, gr.radius, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); g.strokePath();
      g.lineStyle(1, c, 0.3).strokeCircle(gr.x, gr.y, gr.radius);
      g.fillStyle(0x000000, 0.4).fillEllipse(gx, gy + 4, 12 - h / 10, 6 - h / 20);
      g.fillStyle(c, 0.5).fillCircle(gx, gy - h, 8).fillStyle(teamCol(gr.team)).fillCircle(gx, gy - h, 5).fillStyle(0xffffff, blink).fillCircle(gx + 1.5, gy - h - 1.5, 1.5);
    }

    // Eksplosion: hvidt glimt, chokbølge i holdfarve, gnister
    this.booms = this.booms.filter(b => now - b.born < A.explosion.ms);
    for (const b of this.booms) {
      const k = (now - b.born) / A.explosion.ms, c = teamGlow(b.team);
      if (k < 0.35) g.fillStyle(0xffffff, 0.8 * (1 - k / 0.35)).fillCircle(b.x, b.y, b.radius * (0.4 + k));
      g.fillStyle(c, 0.25 * (1 - k)).fillCircle(b.x, b.y, b.radius * (0.7 + 0.3 * k));
      g.lineStyle(4 * (1 - k) + 1, c, 1 - k).strokeCircle(b.x, b.y, b.radius * (0.5 + 0.7 * k));
    }
    this.debris = this.debris.filter(d => now - d.born < A.explosion.debrisMs);
    for (const d of this.debris) { const t = (now - d.born) / 1000, k = (now - d.born) / A.explosion.debrisMs; g.fillStyle(d.c, 1 - k).fillCircle(d.x + d.vx * t * (1 - k * 0.5), d.y + d.vy * t * (1 - k * 0.5), 3 * (1 - k) + 1); }

    // Dash: efterbilleder langs ruten
    this.dashes = this.dashes.filter(d => now - d.born < A.dash.ms);
    for (const d of this.dashes) {
      const k = (now - d.born) / A.dash.ms, a = Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x), c = teamGlow(d.team);
      g.lineStyle(d.r * 0.8 * (1 - k), c, 0.25 * (1 - k)).lineBetween(d.from.x, d.from.y, d.to.x, d.to.y);
      for (let i = 0; i < A.dash.ghosts; i++) {
        const f = i / A.dash.ghosts, x = d.from.x + (d.to.x - d.from.x) * f, y = d.from.y + (d.to.y - d.from.y) * f;
        g.fillStyle(c, 0.35 * (1 - k) * (0.4 + 0.6 * f)).fillCircle(x, y, d.r * 0.8);
      }
    }

    // Fokus: guld-sigtekorn der drejer om Sniperen. Usårlighed: hvid skinnende ring.
    for (const p of cur.players) {
      if (!p.alive) continue; const r = (p.radius ?? 18);
      if (p.focusLeft > 0) {
        const rot = now / 1000 * A.focus.spin, R = r + 9;
        g.lineStyle(2, PALETTE.score, 0.9);
        for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; g.beginPath(); g.arc(p.x, p.y, R, a - 0.35, a + 0.35); g.strokePath(); g.lineBetween(p.x + Math.cos(a) * (R + 2), p.y + Math.sin(a) * (R + 2), p.x + Math.cos(a) * (R + 7), p.y + Math.sin(a) * (R + 7)); }
      }
      if (p.invulnLeft > 0) {
        const s = 0.5 + 0.5 * Math.sin(now / A.invuln.pulseMs * 6.28);
        g.fillStyle(0xffffff, 0.12 + 0.12 * s).fillCircle(p.x, p.y, r + 4).lineStyle(2, 0xffffff, 0.5 + 0.4 * s).strokeCircle(p.x, p.y, r + 6);
      }
    }
  }
}
