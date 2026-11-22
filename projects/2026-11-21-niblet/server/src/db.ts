import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ALLERGENS, type EntryRow, type Severity } from "./analysis.js";

export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      meal TEXT NOT NULL,
      food TEXT NOT NULL,
      allergen TEXT,
      reaction TEXT NOT NULL DEFAULT 'none',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
  `);
  return db;
}

/** Guess an allergen category from a food name (e.g. "scrambled egg" -> egg). */
const KEYWORDS: Record<string, string[]> = {
  egg: ["egg", "omelette", "omelet"],
  peanut: ["peanut"],
  milk: ["milk", "yoghurt", "yogurt", "cheese", "butter", "cream"],
  wheat: ["wheat", "bread", "pasta", "toast", "weetabix", "couscous"],
  soy: ["soy", "tofu", "edamame"],
  fish: ["fish", "salmon", "cod", "tuna", "haddock"],
  shellfish: ["prawn", "shrimp", "crab", "shellfish", "mussel"],
  "tree nut": ["almond", "cashew", "walnut", "hazelnut", "pistachio", "nut butter"],
  sesame: ["sesame", "tahini", "hummus"],
};
export function detectAllergen(food: string): string | null {
  const f = food.toLowerCase();
  for (const a of ALLERGENS) if (KEYWORDS[a].some((k) => f.includes(k))) return a;
  return null;
}

export interface NewEntry { date: string; meal: string; food: string; reaction?: Severity; notes?: string; allergen?: string | null }

export function addEntry(db: Database.Database, e: NewEntry): EntryRow {
  const allergen = e.allergen === undefined ? detectAllergen(e.food) : e.allergen;
  const info = db.prepare("INSERT INTO entries (date, meal, food, allergen, reaction, notes) VALUES (?,?,?,?,?,?)")
    .run(e.date, e.meal, e.food.trim(), allergen, e.reaction ?? "none", e.notes ?? "");
  return db.prepare("SELECT * FROM entries WHERE id = ?").get(info.lastInsertRowid) as EntryRow;
}

export function listEntries(db: Database.Database, from?: string, to?: string): EntryRow[] {
  return db.prepare("SELECT * FROM entries WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC")
    .all(from ?? "0000-01-01", to ?? "9999-12-31") as EntryRow[];
}

export function getSetting(db: Database.Database, key: string, fallback = ""): string {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? fallback;
}
export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
