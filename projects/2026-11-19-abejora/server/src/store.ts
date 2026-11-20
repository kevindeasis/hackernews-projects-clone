import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Table = "clients" | "projects" | "entries";
export type Row = Record<string, string | number | null>;

export interface HistoryItem {
  seq: number;
  tbl: Table;
  rowId: number;
  label: string;
  before: Row | null;
  after: Row | null;
  undone: boolean;
  at: string;
}

const COLUMNS: Record<Table, string[]> = {
  clients: ["id", "name", "archived"],
  projects: ["id", "client_id", "name", "rate_cents", "color"],
  entries: ["id", "project_id", "description", "started_at", "ended_at", "billable"],
};

/**
 * SQLite store. Every mutation goes through `change()`, which records a
 * before/after row snapshot in `history`. Undo/redo just re-applies a snapshot,
 * so any entity type gets full change history + undo/redo for free.
 */
export class Store {
  db: Database.Database;

  constructor(dataDir: string | ":memory:") {
    if (dataDir !== ":memory:") fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(dataDir === ":memory:" ? ":memory:" : path.join(dataDir, "abejora.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, name TEXT NOT NULL, rate_cents INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#f5a524');
      CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL, ended_at TEXT, billable INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS history (seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, row_id INTEGER NOT NULL, label TEXT NOT NULL, before TEXT, after TEXT, undone INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
    `);
  }

  get(tbl: Table, id: number): Row | null {
    return (this.db.prepare(`SELECT * FROM ${tbl} WHERE id = ?`).get(id) as Row | undefined) ?? null;
  }

  list(tbl: Table): Row[] {
    return this.db.prepare(`SELECT * FROM ${tbl} ORDER BY id`).all() as Row[];
  }

  /** Write a row state (or delete when `row` is null) without touching history. */
  private apply(tbl: Table, id: number, row: Row | null) {
    if (row === null) {
      this.db.prepare(`DELETE FROM ${tbl} WHERE id = ?`).run(id);
      return;
    }
    const cols = COLUMNS[tbl];
    this.db
      .prepare(`INSERT OR REPLACE INTO ${tbl} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`)
      .run({ ...row, id });
  }

  private record(tbl: Table, rowId: number, label: string, before: Row | null, after: Row | null) {
    this.db.prepare("DELETE FROM history WHERE undone = 1").run(); // new change kills the redo tail
    this.db
      .prepare("INSERT INTO history (tbl,row_id,label,before,after,at) VALUES (?,?,?,?,?,?)")
      .run(tbl, rowId, label, JSON.stringify(before), JSON.stringify(after), new Date().toISOString());
  }

  create(tbl: Table, values: Row, label: string): Row {
    const cols = COLUMNS[tbl].filter((c) => c !== "id" && c in values);
    const info = this.db
      .prepare(`INSERT INTO ${tbl} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`)
      .run(values);
    const after = this.get(tbl, Number(info.lastInsertRowid))!;
    this.record(tbl, after.id as number, label, null, after);
    return after;
  }

  update(tbl: Table, id: number, patch: Row, label: string): Row | null {
    const before = this.get(tbl, id);
    if (!before) return null;
    const after = { ...before, ...patch, id };
    this.apply(tbl, id, after);
    this.record(tbl, id, label, before, after);
    return after;
  }

  remove(tbl: Table, id: number, label: string): boolean {
    const before = this.get(tbl, id);
    if (!before) return false;
    this.apply(tbl, id, null);
    this.record(tbl, id, label, before, null);
    return true;
  }

  private toItem(r: any): HistoryItem {
    return {
      seq: r.seq,
      tbl: r.tbl,
      rowId: r.row_id,
      label: r.label,
      before: r.before ? JSON.parse(r.before) : null,
      after: r.after ? JSON.parse(r.after) : null,
      undone: !!r.undone,
      at: r.at,
    };
  }

  history(limit = 50): HistoryItem[] {
    return (this.db.prepare("SELECT * FROM history ORDER BY seq DESC LIMIT ?").all(limit) as any[]).map((r) => this.toItem(r));
  }

  undo(): HistoryItem | null {
    const r = this.db.prepare("SELECT * FROM history WHERE undone = 0 ORDER BY seq DESC LIMIT 1").get() as any;
    if (!r) return null;
    const item = this.toItem(r);
    this.db.transaction(() => {
      this.apply(item.tbl, item.rowId, item.before);
      this.db.prepare("UPDATE history SET undone = 1 WHERE seq = ?").run(item.seq);
    })();
    return { ...item, undone: true };
  }

  redo(): HistoryItem | null {
    const r = this.db.prepare("SELECT * FROM history WHERE undone = 1 ORDER BY seq ASC LIMIT 1").get() as any;
    if (!r) return null;
    const item = this.toItem(r);
    this.db.transaction(() => {
      this.apply(item.tbl, item.rowId, item.after);
      this.db.prepare("UPDATE history SET undone = 0 WHERE seq = ?").run(item.seq);
    })();
    return { ...item, undone: false };
  }

  running(): Row | null {
    return (this.db.prepare("SELECT * FROM entries WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1").get() as Row | undefined) ?? null;
  }
}
