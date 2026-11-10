import { openDb, type DB } from "./db.js";

const CINEMAS: [string, string][] = [
  ["TOHO Cinemas Shinjuku", "Shinjuku"],
  ["Shinjuku Piccadilly", "Shinjuku"],
  ["Shibuya Cinema Quartet", "Shibuya"],
  ["HUMAX Cinema Shibuya", "Shibuya"],
  ["TOHO Cinemas Roppongi Hills", "Roppongi"],
  ["109 Cinemas Premium Shinjuku", "Shinjuku"],
];
const FILMS: [string, number][] = [
  ["Spirited Away (re-release)", 125],
  ["Perfect Days", 124],
  ["Godzilla Minus One", 125],
  ["Dune: Part Three", 160],
  ["Evangelion: Complete Cut", 140],
];
const FORMATS = ["2D", "2D", "IMAX", "Dolby", "4DX"];
const SLOTS = ["10:00", "12:40", "15:20", "18:00", "20:45"];

/** Deterministic demo data: next 7 days starting at `startDate` (YYYY-MM-DD). */
export function seed(db: DB, startDate: string) {
  db.exec("DELETE FROM showtimes; DELETE FROM films; DELETE FROM cinemas;");
  const insC = db.prepare("INSERT INTO cinemas (name, area) VALUES (?, ?)");
  const insF = db.prepare("INSERT INTO films (title, runtime_min) VALUES (?, ?)");
  const insS = db.prepare("INSERT INTO showtimes (cinema_id, film_id, starts_at, format) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    const cids = CINEMAS.map(([n, a]) => Number(insC.run(n, a).lastInsertRowid));
    const fids = FILMS.map(([t, r]) => Number(insF.run(t, r).lastInsertRowid));
    const base = new Date(startDate + "T00:00:00Z");
    for (let d = 0; d < 7; d++) {
      const day = new Date(base.getTime() + d * 86400000).toISOString().slice(0, 10);
      cids.forEach((cid, ci) => {
        SLOTS.forEach((slot, si) => {
          const fid = fids[(ci + si + d) % fids.length];
          insS.run(cid, fid, `${day}T${slot}`, FORMATS[(ci + si) % FORMATS.length]);
        });
      });
    }
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  seed(db, new Date().toISOString().slice(0, 10));
  console.log("Seeded demo data.");
}
