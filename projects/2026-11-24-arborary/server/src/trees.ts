import Papa from "papaparse";
import { z } from "zod";
import type { Db } from "./db.js";
import { bboxAreaM2, canopyArea, densityGrid, type Bbox } from "./geo.js";

export interface Tree {
  id: number; lat: number; lng: number; species: string | null;
  canopy_m: number; confidence: number; status: "detected" | "confirmed" | "rejected"; source: string;
}
export interface City { id: number; slug: string; name: string; lat: number; lng: number; zoom: number }

export const listCities = (db: Db) =>
  db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM trees t WHERE t.city_id = c.id AND t.status != 'rejected') AS trees
              FROM cities c ORDER BY name`).all();

export const getCity = (db: Db, slug: string) =>
  db.prepare("SELECT * FROM cities WHERE slug = ?").get(slug) as City | undefined;

export interface TreeFilter {
  bbox?: Bbox; status?: string; species?: string; minConfidence?: number; limit?: number;
}

export function listTrees(db: Db, cityId: number, f: TreeFilter): Tree[] {
  const where = ["city_id = ?"];
  const args: unknown[] = [cityId];
  if (f.bbox) {
    where.push("lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?");
    args.push(f.bbox.south, f.bbox.north, f.bbox.west, f.bbox.east);
  }
  if (f.status) { where.push("status = ?"); args.push(f.status); }
  else where.push("status != 'rejected'");
  if (f.species) { where.push("species = ?"); args.push(f.species); }
  if (f.minConfidence !== undefined) { where.push("confidence >= ?"); args.push(f.minConfidence); }
  args.push(Math.min(f.limit ?? 5000, 20000));
  return db.prepare(`SELECT id, lat, lng, species, canopy_m, confidence, status, source FROM trees
                     WHERE ${where.join(" AND ")} ORDER BY id LIMIT ?`).all(...args) as Tree[];
}

export function cityStats(db: Db, cityId: number, bbox: Bbox, gridN = 12) {
  const trees = listTrees(db, cityId, { bbox, limit: 20000 });
  const areaKm2 = bboxAreaM2(bbox) / 1e6;
  const canopyTotal = trees.reduce((s, t) => s + canopyArea(t.canopy_m), 0);
  const bySpecies = new Map<string, number>();
  for (const t of trees) {
    const k = t.species ?? "Unknown";
    bySpecies.set(k, (bySpecies.get(k) ?? 0) + 1);
  }
  const reviewed = trees.filter((t) => t.status !== "detected").length;
  return {
    total: trees.length,
    areaKm2,
    treesPerKm2: areaKm2 > 0 ? trees.length / areaKm2 : 0,
    canopyCover: Math.min(1, canopyTotal / bboxAreaM2(bbox)),
    meanCanopyM: trees.length ? trees.reduce((s, t) => s + t.canopy_m, 0) / trees.length : 0,
    reviewed,
    topSpecies: [...bySpecies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([species, count]) => ({ species, count })),
    grid: { n: gridN, cells: densityGrid(trees, bbox, gridN) },
  };
}

/** Next tree to review: lowest-confidence tree still in 'detected' state. */
export function nextToReview(db: Db, cityId: number): Tree | undefined {
  return db.prepare(`SELECT id, lat, lng, species, canopy_m, confidence, status, source FROM trees
    WHERE city_id = ? AND status = 'detected' ORDER BY confidence ASC, id ASC LIMIT 1`).get(cityId) as Tree | undefined;
}

export const patchSchema = z.object({
  status: z.enum(["detected", "confirmed", "rejected"]).optional(),
  species: z.string().trim().max(80).nullable().optional(),
  canopy_m: z.number().min(0.5).max(60).optional(),
}).refine((v) => Object.keys(v).length > 0, "empty patch");

export function patchTree(db: Db, id: number, patch: z.infer<typeof patchSchema>): Tree | undefined {
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) { sets.push(`${k} = ?`); args.push(v); }
  const r = db.prepare(`UPDATE trees SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
  if (!r.changes) return undefined;
  return db.prepare("SELECT id, lat, lng, species, canopy_m, confidence, status, source FROM trees WHERE id = ?").get(id) as Tree;
}

export const newTreeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  species: z.string().trim().max(80).nullable().optional(),
  canopy_m: z.number().min(0.5).max(60).default(4),
});

export function addTree(db: Db, cityId: number, t: z.infer<typeof newTreeSchema>): Tree {
  const r = db.prepare(`INSERT INTO trees (city_id, lat, lng, species, canopy_m, confidence, status, source)
    VALUES (?, ?, ?, ?, ?, 1, 'confirmed', 'manual')`).run(cityId, t.lat, t.lng, t.species ?? null, t.canopy_m);
  return db.prepare("SELECT id, lat, lng, species, canopy_m, confidence, status, source FROM trees WHERE id = ?")
    .get(r.lastInsertRowid) as Tree;
}

/**
 * Import trees from CSV text. Accepts headers lat/lng (or latitude/longitude),
 * optional species, canopy_m (or crown_diameter), confidence. Invalid rows are skipped and reported.
 */
export function importCsv(db: Db, cityId: number, text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
  });
  const ins = db.prepare(`INSERT INTO trees (city_id, lat, lng, species, canopy_m, confidence, status, source)
    VALUES (?, ?, ?, ?, ?, ?, 'detected', 'import')`);
  let imported = 0;
  const errors: { row: number; reason: string }[] = [];
  const tx = db.transaction(() => {
    parsed.data.forEach((r, i) => {
      const lat = Number(r.lat ?? r.latitude);
      const lng = Number(r.lng ?? r.lon ?? r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        errors.push({ row: i + 2, reason: "invalid coordinates" });
        return;
      }
      const canopy = Number(r.canopy_m ?? r.crown_diameter ?? 4) || 4;
      const conf = r.confidence === undefined || r.confidence === "" ? 1 : Number(r.confidence);
      ins.run(cityId, lat, lng, r.species?.trim() || null, Math.min(60, Math.max(0.5, canopy)),
        Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 1);
      imported++;
    });
  });
  tx();
  return { imported, skipped: errors.length, errors: errors.slice(0, 20) };
}
