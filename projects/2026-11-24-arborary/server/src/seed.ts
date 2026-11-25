import type { Db } from "./db.js";

/** Small deterministic PRNG so demo data is identical on every machine. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES = [
  ["London plane", 9], ["Brisbane box", 8], ["Victorian box", 6], ["Chinese flame", 4],
  ["Southern magnolia", 5], ["Ficus (Indian laurel)", 3], ["Coast live oak", 4], ["Callery pear", 3],
] as const;

/**
 * Seeds SYNTHETIC demo data: trees placed along a street grid near the Mission
 * district of San Francisco. Not real inventory data -- import real CSVs via the UI.
 */
export function seed(db: Db) {
  db.prepare("INSERT INTO cities (slug, name, lat, lng, zoom) VALUES (?,?,?,?,?)")
    .run("ussfo", "San Francisco (synthetic demo)", 37.7599, -122.4148, 15);
  const cityId = (db.prepare("SELECT id FROM cities WHERE slug = 'ussfo'").get() as { id: number }).id;
  const rnd = mulberry32(42);
  const total = SPECIES.reduce((s, [, w]) => s + w, 0);
  const pick = () => {
    let r = rnd() * total;
    for (const [name, w] of SPECIES) { if ((r -= w) <= 0) return name; }
    return SPECIES[0][0];
  };
  const ins = db.prepare(`INSERT INTO trees (city_id, lat, lng, species, canopy_m, confidence, status, source)
    VALUES (?,?,?,?,?,?,'detected','detector')`);
  const south = 37.752, north = 37.768, west = -122.426, east = -122.404;
  const tx = db.transaction(() => {
    // East-west streets every ~110 m, north-south every ~130 m; trees every ~12 m along both kerbs.
    for (let lat = south; lat <= north; lat += 0.001) {
      for (let lng = west; lng <= east; lng += 0.00014) {
        if (rnd() < 0.55) {
          const off = rnd() < 0.5 ? 0.00004 : -0.00004;
          const conf = 0.5 + rnd() * 0.5;
          ins.run(cityId, lat + off + (rnd() - 0.5) * 0.00002, lng, rnd() < 0.9 ? pick() : null,
            +(2.5 + rnd() * 8).toFixed(1), +conf.toFixed(2));
        }
      }
    }
    for (let lng = west; lng <= east; lng += 0.0015) {
      for (let lat = south; lat <= north; lat += 0.00011) {
        if (rnd() < 0.55) {
          const off = rnd() < 0.5 ? 0.00005 : -0.00005;
          ins.run(cityId, lat, lng + off + (rnd() - 0.5) * 0.00002, rnd() < 0.9 ? pick() : null,
            +(2.5 + rnd() * 8).toFixed(1), +(0.5 + rnd() * 0.5).toFixed(2));
        }
      }
    }
  });
  tx();
}
