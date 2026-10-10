import { SHAPES, FX } from './palette.js';

// Tegner en enhed med klassens silhuet. angle = sigteretning i radianer.
export function drawUnit(g, shapeKey, x, y, r, angle, fill, glow) {
  const s = SHAPES[shapeKey] || SHAPES.assault;
  const a = s.noRotate ? 0 : angle, c = Math.cos(a), sn = Math.sin(a);
  const poly = (k) => s.pts.map(([px, py]) => ({ x: x + (px * c - py * sn) * r * k, y: y + (px * sn + py * c) * r * k }));
  if (s.shape === 'circle') {
    g.fillStyle(glow, FX.glowAlpha * 0.5).fillCircle(x, y, r + 4).fillStyle(fill).fillCircle(x, y, r);
  } else {
    g.fillStyle(glow, FX.glowAlpha * 0.5).fillPoints(poly(1 + 4 / r), true).fillStyle(fill).fillPoints(poly(1), true);
  }
  if (s.nose) { // lille lys prik, der viser sigteretningen på ikke-spidse former
    g.fillStyle(glow).fillCircle(x + Math.cos(angle) * r * 1.45, y + Math.sin(angle) * r * 1.45, Math.max(2, r * 0.22));
  }
}
