import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      visits INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title, body, url, content='pages', content_rowid='id', tokenize='porter unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, body, url) VALUES (new.id, new.title, new.body, new.url);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, body, url) VALUES ('delete', old.id, old.title, old.body, old.url);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, body, url) VALUES ('delete', old.id, old.title, old.body, old.url);
      INSERT INTO pages_fts(rowid, title, body, url) VALUES (new.id, new.title, new.body, new.url);
    END;
    CREATE TABLE IF NOT EXISTS blocklist (
      domain TEXT PRIMARY KEY
    );
  `);
  return db;
}
