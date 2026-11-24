import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDb(file = process.env.DB_FILE ?? "data/app.db") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS completions (
      user TEXT NOT NULL REFERENCES users(name), lesson_id TEXT NOT NULL, xp INTEGER NOT NULL,
      day TEXT NOT NULL, PRIMARY KEY (user, lesson_id)
    );
  `);
  return db;
}
