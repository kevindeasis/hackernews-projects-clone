import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      goal_cents INTEGER NOT NULL,
      -- suggested -> funding -> testing -> complete, or funding -> expired
      status TEXT NOT NULL DEFAULT 'funding',
      created_at TEXT NOT NULL,
      deadline TEXT NOT NULL,
      funded_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pledges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      refunded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pledges_product ON pledges(product_id);
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      lot TEXT NOT NULL,
      analyte TEXT NOT NULL,
      value_ng_g REAL,            -- NULL = not detected
      loq_ng_g REAL NOT NULL      -- limit of quantification
    );
    CREATE INDEX IF NOT EXISTS idx_results_product ON results(product_id);
  `);
  return db;
}
