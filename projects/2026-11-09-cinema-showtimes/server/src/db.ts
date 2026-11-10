import Database from "better-sqlite3";

export type DB = Database.Database;

export function openDb(path = process.env.DB_PATH ?? "./data/showtimes.db"): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cinemas (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      area TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS films (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      runtime_min INTEGER
    );
    CREATE TABLE IF NOT EXISTS showtimes (
      id INTEGER PRIMARY KEY,
      cinema_id INTEGER NOT NULL REFERENCES cinemas(id),
      film_id INTEGER NOT NULL REFERENCES films(id),
      starts_at TEXT NOT NULL,      -- ISO local time, e.g. 2026-11-10T19:30
      format TEXT NOT NULL          -- 2D | 3D | IMAX | 4DX | Dolby
    );
    CREATE INDEX IF NOT EXISTS idx_showtimes_start ON showtimes(starts_at);
  `);
  return db;
}
