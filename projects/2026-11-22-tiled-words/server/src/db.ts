import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
      client_id TEXT NOT NULL,
      key TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '{}',
      reveals INTEGER NOT NULL DEFAULT 0,
      moves INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      PRIMARY KEY (client_id, key)
    );
  `);
  return db;
}

export interface ProgressRow {
  state: string;
  reveals: number;
  moves: number;
  completed_at: string | null;
}

export function getProgress(db: Database.Database, clientId: string, key: string): ProgressRow | undefined {
  return db.prepare("SELECT state, reveals, moves, completed_at FROM progress WHERE client_id=? AND key=?").get(clientId, key) as
    | ProgressRow
    | undefined;
}

export function saveProgress(db: Database.Database, clientId: string, key: string, state: unknown, moves: number) {
  db.prepare(
    `INSERT INTO progress (client_id, key, state, moves) VALUES (?,?,?,?)
     ON CONFLICT(client_id, key) DO UPDATE SET state=excluded.state, moves=excluded.moves`,
  ).run(clientId, key, JSON.stringify(state), moves);
}

/** Bump the reveal counter; returns the new count, or null if the limit was reached. */
export function useReveal(db: Database.Database, clientId: string, key: string, limit: number): number | null {
  db.prepare("INSERT OR IGNORE INTO progress (client_id, key) VALUES (?,?)").run(clientId, key);
  const row = getProgress(db, clientId, key)!;
  if (row.reveals >= limit) return null;
  db.prepare("UPDATE progress SET reveals = reveals + 1 WHERE client_id=? AND key=?").run(clientId, key);
  return row.reveals + 1;
}

export function markComplete(db: Database.Database, clientId: string, key: string, moves: number) {
  db.prepare("INSERT OR IGNORE INTO progress (client_id, key) VALUES (?,?)").run(clientId, key);
  db.prepare("UPDATE progress SET completed_at = COALESCE(completed_at, ?), moves = ? WHERE client_id=? AND key=?").run(
    new Date().toISOString(),
    moves,
    clientId,
    key,
  );
}

export function completedKeys(db: Database.Database, clientId: string): string[] {
  return (
    db.prepare("SELECT key FROM progress WHERE client_id=? AND completed_at IS NOT NULL").all(clientId) as { key: string }[]
  ).map((r) => r.key);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export { addDays };

/** Streak over daily-puzzle dates. Current streak survives if today is not yet solved but yesterday was. */
export function computeStreaks(completed: string[], today: string) {
  const days = new Set(completed.filter((k) => DATE_KEY.test(k)));
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best, played: completed.length };
}
