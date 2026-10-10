// Firkantet grid: koordinater (x, y) i tiles. Al gameplay i tiles og sekunder; TILE_PX bruges kun til omregning.
export const TILE_PX = 48;
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8 = [...DIRS4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const key = (x, y) => x + ',' + y;
export const tileToPixel = (x, y) => ({ x: (x + 0.5) * TILE_PX, y: (y + 0.5) * TILE_PX }); // centrum af tilen
export const pixelToTile = (px, py) => ({ x: Math.floor(px / TILE_PX), y: Math.floor(py / TILE_PX) });
