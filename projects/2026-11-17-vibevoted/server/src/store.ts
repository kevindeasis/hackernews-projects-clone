import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Evaluation, ProductInput } from "./judges.js";

export interface Competition {
  id: number;
  slug: string;
  title: string;
  description: string;
  criteria: string[];
  created_at: string;
}
export interface Product extends ProductInput {
  id: number;
  competition_id: number;
  created_at: string;
}
export interface StoredEvaluation extends Evaluation {
  product_id: number;
  judge_id: string;
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "competition";

export class Store {
  db: Database.Database;
  constructor(dir: string | ":memory:") {
    if (dir !== ":memory:") fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dir === ":memory:" ? ":memory:" : path.join(dir, "vibevoted.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS competitions (
        id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', criteria TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY, competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        name TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', tagline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS evaluations (
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        judge_id TEXT NOT NULL, scores TEXT NOT NULL, overall REAL NOT NULL, rationale TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (product_id, judge_id));
    `);
  }

  private uniqueSlug(title: string) {
    const base = slugify(title);
    let slug = base;
    for (let i = 2; this.db.prepare("SELECT 1 FROM competitions WHERE slug=?").get(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  private toComp(r: any): Competition {
    return { ...r, criteria: JSON.parse(r.criteria) };
  }

  createCompetition(title: string, description: string, criteria: string[]): Competition {
    const info = this.db
      .prepare("INSERT INTO competitions (slug,title,description,criteria) VALUES (?,?,?,?)")
      .run(this.uniqueSlug(title), title, description, JSON.stringify(criteria));
    return this.toComp(this.db.prepare("SELECT * FROM competitions WHERE id=?").get(info.lastInsertRowid));
  }
  listCompetitions(): (Competition & { product_count: number })[] {
    return this.db
      .prepare("SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.competition_id=c.id) AS product_count FROM competitions c ORDER BY c.id DESC")
      .all()
      .map((r: any) => ({ ...this.toComp(r), product_count: r.product_count }));
  }
  getCompetition(slug: string): Competition | undefined {
    const r = this.db.prepare("SELECT * FROM competitions WHERE slug=?").get(slug);
    return r ? this.toComp(r) : undefined;
  }
  addProduct(competitionId: number, p: ProductInput): Product {
    const info = this.db
      .prepare("INSERT INTO products (competition_id,name,url,tagline,description) VALUES (?,?,?,?,?)")
      .run(competitionId, p.name, p.url, p.tagline, p.description);
    return this.getProduct(Number(info.lastInsertRowid))!;
  }
  getProduct(id: number): Product | undefined {
    return this.db.prepare("SELECT * FROM products WHERE id=?").get(id) as Product | undefined;
  }
  listProducts(competitionId: number): Product[] {
    return this.db.prepare("SELECT * FROM products WHERE competition_id=? ORDER BY id").all(competitionId) as Product[];
  }
  deleteProduct(id: number) {
    return this.db.prepare("DELETE FROM products WHERE id=?").run(id).changes > 0;
  }
  saveEvaluation(productId: number, judgeId: string, e: Evaluation) {
    this.db
      .prepare("INSERT OR REPLACE INTO evaluations (product_id,judge_id,scores,overall,rationale) VALUES (?,?,?,?,?)")
      .run(productId, judgeId, JSON.stringify(e.scores), e.overall, e.rationale);
  }
  listEvaluations(competitionId: number): StoredEvaluation[] {
    return this.db
      .prepare("SELECT e.* FROM evaluations e JOIN products p ON p.id=e.product_id WHERE p.competition_id=? ORDER BY e.product_id, e.judge_id")
      .all(competitionId)
      .map((r: any) => ({ product_id: r.product_id, judge_id: r.judge_id, scores: JSON.parse(r.scores), overall: r.overall, rationale: r.rationale }));
  }
}
