import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface Exercise {
  id: number;
  name: string;
  created_at: string;
}
export interface StoredSet {
  id: number;
  exercise_id: number;
  weight: number;
  reps: number;
  rpe: number | null;
  date: string;
}
export interface Settings {
  unit: "kg" | "lb";
  increment: number;
  rir: number;
}

const DEFAULT_SETTINGS: Settings = { unit: "kg", increment: 2.5, rir: 1 };

export class Store {
  db: Database.Database;
  constructor(dir: string | ":memory:") {
    if (dir !== ":memory:") fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dir === ":memory:" ? dir : path.join(dir, "curvefit.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        weight REAL NOT NULL, reps INTEGER NOT NULL, rpe REAL,
        date TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sets_ex ON sets(exercise_id, date);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  listExercises(): Exercise[] {
    return this.db.prepare("SELECT * FROM exercises ORDER BY name").all() as Exercise[];
  }
  getExercise(id: number): Exercise | undefined {
    return this.db.prepare("SELECT * FROM exercises WHERE id = ?").get(id) as Exercise | undefined;
  }
  addExercise(name: string): Exercise {
    const info = this.db.prepare("INSERT INTO exercises (name) VALUES (?)").run(name);
    return this.getExercise(Number(info.lastInsertRowid))!;
  }
  deleteExercise(id: number) {
    return this.db.prepare("DELETE FROM exercises WHERE id = ?").run(id).changes > 0;
  }

  listSets(exerciseId: number): StoredSet[] {
    return this.db
      .prepare("SELECT * FROM sets WHERE exercise_id = ? ORDER BY date, id")
      .all(exerciseId) as StoredSet[];
  }
  addSet(s: Omit<StoredSet, "id">): StoredSet {
    const info = this.db
      .prepare("INSERT INTO sets (exercise_id, weight, reps, rpe, date) VALUES (?,?,?,?,?)")
      .run(s.exercise_id, s.weight, s.reps, s.rpe, s.date);
    return this.db.prepare("SELECT * FROM sets WHERE id = ?").get(info.lastInsertRowid) as StoredSet;
  }
  deleteSet(id: number) {
    return this.db.prepare("DELETE FROM sets WHERE id = ?").run(id).changes > 0;
  }

  getSettings(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) s[r.key] = r.key === "unit" ? r.value : Number(r.value);
    return s as unknown as Settings;
  }
  saveSettings(patch: Partial<Settings>) {
    const up = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) up.run(k, String(v));
    return this.getSettings();
  }
}
