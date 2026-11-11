import type { Db } from "./db.js";

export interface Temple {
  id: number;
  name: string;
  deity: string;
  state: string;
  city: string;
  tradition: string;
  lat: number;
  lng: number;
  description: string;
}

export interface TempleFilter {
  q?: string;
  state?: string;
  tradition?: string;
}

function where(f: TempleFilter): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (f.q) {
    clauses.push("(name LIKE ? OR deity LIKE ? OR city LIKE ? OR description LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }
  if (f.state) { clauses.push("state = ?"); params.push(f.state); }
  if (f.tradition) { clauses.push("tradition = ?"); params.push(f.tradition); }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function listTemples(db: Db, f: TempleFilter): Temple[] {
  const { sql, params } = where(f);
  return db.prepare(`SELECT * FROM temples ${sql} ORDER BY name`).all(...params) as Temple[];
}

export function getTemple(db: Db, id: number): Temple | undefined {
  return db.prepare("SELECT * FROM temples WHERE id = ?").get(id) as Temple | undefined;
}

/** Random temple among those matching the filter. `rand` is injectable for tests. */
export function randomTemple(db: Db, f: TempleFilter, rand: () => number = Math.random): Temple | undefined {
  const { sql, params } = where(f);
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM temples ${sql}`).get(...params) as { n: number }).n;
  if (n === 0) return undefined;
  const offset = Math.min(n - 1, Math.floor(rand() * n));
  return db.prepare(`SELECT * FROM temples ${sql} ORDER BY id LIMIT 1 OFFSET ?`).get(...params, offset) as Temple;
}

export function facets(db: Db): { states: string[]; traditions: string[] } {
  const col = (c: string) => (db.prepare(`SELECT DISTINCT ${c} AS v FROM temples ORDER BY v`).all() as { v: string }[]).map((r) => r.v);
  return { states: col("state"), traditions: col("tradition") };
}
