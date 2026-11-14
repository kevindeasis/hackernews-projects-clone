import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS securities (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('stock','etf')),
      sector TEXT NOT NULL DEFAULT 'Other',
      market_cap REAL NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS prices (
      symbol TEXT NOT NULL REFERENCES securities(symbol) ON DELETE CASCADE,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (symbol, date)
    );
    CREATE TABLE IF NOT EXISTS holdings (
      etf TEXT NOT NULL REFERENCES securities(symbol) ON DELETE CASCADE,
      symbol TEXT NOT NULL REFERENCES securities(symbol) ON DELETE CASCADE,
      weight REAL NOT NULL,
      PRIMARY KEY (etf, symbol)
    );
  `);
  return db;
}
