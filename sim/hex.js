// Hex-matematik: axial (q, r), pointy-top. Al gameplay i hex-enheder; HEX_PX bruges kun til omregning.
export const HEX_PX = 64;
const S3 = Math.sqrt(3);
export const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
export const key = (q, r) => q + ',' + r;
export function hexToPixel(q, r, size = HEX_PX) { return { x: size * S3 * (q + r / 2), y: size * 1.5 * r }; }
export function pixelToHex(x, y, size = HEX_PX) {
  const q = (S3 / 3 * x - y / 3) / size, r = (2 / 3 * y) / size;
  return hexRound(q, r);
}
export function hexRound(q, r) {
  const s = -q - r; let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
export function hexCorners(q, r, size = HEX_PX) {
  const c = hexToPixel(q, r, size), out = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); out.push({ x: c.x + size * Math.cos(a), y: c.y + size * Math.sin(a) }); }
  return out;
}
export const HEX_DIST = Math.sqrt(3) * HEX_PX; // 1 hex afstand i px (center til center)
