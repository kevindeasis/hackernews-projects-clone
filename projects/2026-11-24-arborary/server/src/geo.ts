export interface Bbox { south: number; west: number; north: number; east: number }

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Area of a lat/lng box in square metres (spherical approximation). */
export function bboxAreaM2(b: Bbox): number {
  return R * R * Math.abs(rad(b.east - b.west)) * Math.abs(Math.sin(rad(b.north)) - Math.sin(rad(b.south)));
}

/** Parse "south,west,north,east". */
export function parseBbox(s: string): Bbox | null {
  const p = s.split(",").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = p;
  if (south >= north || west >= east || Math.abs(south) > 90 || Math.abs(north) > 90) return null;
  return { south, west, north, east };
}

export interface TreePoint { lat: number; lng: number; canopy_m: number }

/** Area covered by a circular canopy of the given diameter. */
export const canopyArea = (diameterM: number) => Math.PI * (diameterM / 2) ** 2;

/**
 * Bin trees into an n x n grid over the box. Each cell reports tree count and
 * canopy cover fraction (sum of canopy circles / cell area, capped at 1).
 */
export function densityGrid(trees: TreePoint[], b: Bbox, n: number) {
  const cellArea = bboxAreaM2(b) / (n * n);
  const cells = Array.from({ length: n * n }, (_, i) => ({
    row: Math.floor(i / n), col: i % n, count: 0, canopyM2: 0,
  }));
  for (const t of trees) {
    if (t.lat < b.south || t.lat > b.north || t.lng < b.west || t.lng > b.east) continue;
    const row = Math.min(n - 1, Math.floor(((t.lat - b.south) / (b.north - b.south)) * n));
    const col = Math.min(n - 1, Math.floor(((t.lng - b.west) / (b.east - b.west)) * n));
    const c = cells[row * n + col];
    c.count++;
    c.canopyM2 += canopyArea(t.canopy_m);
  }
  return cells.map((c) => ({
    row: c.row, col: c.col, count: c.count,
    canopyCover: Math.min(1, c.canopyM2 / cellArea),
  }));
}
