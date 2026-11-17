import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(file = process.env.DB_FILE ?? "puzzles.db"): Db {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      seed TEXT NOT NULL,
      data TEXT NOT NULL,       -- public puzzle JSON (what the player sees)
      solution TEXT NOT NULL,   -- answer key JSON (never sent by the puzzle endpoints)
      achieved TEXT NOT NULL,   -- difficulty the solver actually measured
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kind, difficulty, seed)
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
      seconds INTEGER NOT NULL,
      hints INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}
