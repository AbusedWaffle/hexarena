import { PALETTE } from './palette.js';

// Tegner den firkantede bane i HexArenas mørke stil.
// map = map_*_sq_*.json, T = tile-størrelse i px. crateTint(x,y) -> 0..1 valgfri (skade-toning).
export function drawSquareMap(g, map, T, crateTint = () => 1) {
  const W = map.width, H = map.height, z = map.spawnZones || {};
  const types = new Map(map.tiles.map(t => [t.x + ',' + t.y, t.type]));
  const zoneOf = x => (z.red && x >= z.red.x0 && x <= z.red.x1) ? 'red' : (z.blue && x >= z.blue.x0 && x <= z.blue.x1) ? 'blue' : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x * T, py = y * T, zone = zoneOf(x);
    g.fillStyle(zone === 'red' ? PALETTE.zoneRed : zone === 'blue' ? PALETTE.zoneBlue : PALETTE.hexFloor).fillRect(px, py, T, T);
    g.lineStyle(1, PALETTE.hexLine, 0.8).strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
    if (zone && (zone === 'red' ? x === z.red.x1 : x === z.blue.x0) && !types.get(x + ',' + y)) { // chevron mod midten
      const d = zone === 'red' ? 1 : -1, cx = px + T / 2, cy = py + T / 2, s = T * 0.22;
      g.lineStyle(3, zone === 'red' ? PALETTE.red : PALETTE.blue, 0.35)
       .lineBetween(cx - d * s, cy - s, cx + d * s * 0.6, cy).lineBetween(cx + d * s * 0.6, cy, cx - d * s, cy + s);
    }
  }
  for (const t of map.tiles) {
    const px = t.x * T, py = t.y * T;
    if (t.type === 'wall') {
      g.fillStyle(PALETTE.wall).fillRect(px, py, T, T);
      // kant kun mod gulv, så sammenhængende vægge ser ud som én blok
      g.lineStyle(2, PALETTE.wallEdge, 1);
      if (types.get(t.x + ',' + (t.y - 1)) !== 'wall') g.lineBetween(px, py + 1, px + T, py + 1);
      if (types.get(t.x + ',' + (t.y + 1)) !== 'wall') g.lineBetween(px, py + T - 1, px + T, py + T - 1);
      if (types.get((t.x - 1) + ',' + t.y) !== 'wall') g.lineBetween(px + 1, py, px + 1, py + T);
      if (types.get((t.x + 1) + ',' + t.y) !== 'wall') g.lineBetween(px + T - 1, py, px + T - 1, py + T);
    } else if (t.type === 'crate') {
      const k = crateTint(t.x, t.y), m = T * 0.08;
      g.fillStyle(PALETTE.crate, k).fillRect(px + m, py + m, T - 2 * m, T - 2 * m)
       .lineStyle(2, PALETTE.crateEdge, k).strokeRect(px + m, py + m, T - 2 * m, T - 2 * m)
       .lineStyle(1.5, PALETTE.crateEdge, 0.6 * k).lineBetween(px + m, py + m, px + T - m, py + T - m).lineBetween(px + T - m, py + m, px + m, py + T - m);
    }
  }
}
