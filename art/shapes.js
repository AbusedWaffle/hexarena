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
  // Løb/front: lys bjælke ud af forsiden, så retningen kan ses på alle former
  const b = (px, py) => ({ x: x + (px * Math.cos(angle) - py * Math.sin(angle)) * r, y: y + (px * Math.sin(angle) + py * Math.cos(angle)) * r });
  const L = s.barrel ?? 1.4, w = 0.16;
  g.fillStyle(glow).fillPoints([b(0.55, -w), b(L, -w), b(L, w), b(0.55, w)], true);
}
