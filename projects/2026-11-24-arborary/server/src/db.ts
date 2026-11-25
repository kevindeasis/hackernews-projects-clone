import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      zoom INTEGER NOT NULL DEFAULT 14
    );
    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      species TEXT,
      canopy_m REAL NOT NULL DEFAULT 4,
      confidence REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','confirmed','rejected')),
      source TEXT NOT NULL DEFAULT 'detector'
    );
    CREATE INDEX IF NOT EXISTS trees_city_geo ON trees(city_id, lat, lng);
  `);
  return db;
}
