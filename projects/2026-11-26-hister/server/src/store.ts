import type { Db } from "./db.js";
import { normalizeUrl } from "./extract.js";
import { parseQuery } from "./query.js";

export interface PageRow {
  id: number;
  url: string;
  domain: string;
  title: string;
  visits: number;
  first_seen: string;
  last_seen: string;
}

export interface SearchHit extends PageRow {
  snippet: string;
  score: number;
}

export function isBlocked(db: Db, domain: string): boolean {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    if (db.prepare("SELECT 1 FROM blocklist WHERE domain = ?").get(d)) return true;
  }
  return false;
}

/** Insert a page, or bump its visit counter and refresh its content when already known. */
export function upsertPage(
  db: Db,
  input: { url: string; title: string; text: string },
  now = new Date().toISOString(),
): { id: number; created: boolean } | { blocked: true } {
  const { url, domain } = normalizeUrl(input.url);
  if (isBlocked(db, domain)) return { blocked: true };
  const existing = db.prepare("SELECT id FROM pages WHERE url = ?").get(url) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE pages SET visits = visits + 1, last_seen = ?,
         title = CASE WHEN ? != '' THEN ? ELSE title END,
         body = CASE WHEN ? != '' THEN ? ELSE body END WHERE id = ?`,
    ).run(now, input.title, input.title, input.text, input.text, existing.id);
    return { id: existing.id, created: false };
  }
  const r = db
    .prepare("INSERT INTO pages (url, domain, title, body, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
    .run(url, domain, input.title, input.text, now, now);
  return { id: Number(r.lastInsertRowid), created: true };
}

export function search(db: Db, q: string, opts: { domain?: string; limit?: number } = {}): SearchHit[] {
  const parsed = parseQuery(q);
  const domain = opts.domain ?? parsed.domain;
  const limit = opts.limit ?? 30;
  if (!parsed.match) {
    if (!domain) return [];
    const rows = db
      .prepare(
        `SELECT id, url, domain, title, visits, first_seen, last_seen, substr(body, 1, 200) AS snippet, 0 AS score
         FROM pages WHERE domain = ? OR domain LIKE ? ORDER BY last_seen DESC LIMIT ?`,
      )
      .all(domain, `%.${domain}`, limit);
    return rows as SearchHit[];
  }
  // bm25 weights: title matters most, then url, then body. Lower bm25 = better, so we subtract a visit boost.
  const sql = `
    SELECT p.id, p.url, p.domain, p.title, p.visits, p.first_seen, p.last_seen,
           snippet(pages_fts, 1, '<mark>', '</mark>', ' … ', 24) AS snippet,
           bm25(pages_fts, 10.0, 1.0, 3.0) - log(1 + p.visits) AS score
    FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid
    WHERE pages_fts MATCH @match ${domain ? "AND (p.domain = @domain OR p.domain LIKE @sub)" : ""}
    ORDER BY score LIMIT @limit`;
  return db.prepare(sql).all({ match: parsed.match, domain, sub: domain ? `%.${domain}` : null, limit }) as SearchHit[];
}

export function recent(db: Db, limit = 50): PageRow[] {
  return db
    .prepare("SELECT id, url, domain, title, visits, first_seen, last_seen FROM pages ORDER BY last_seen DESC LIMIT ?")
    .all(limit) as PageRow[];
}

export function stats(db: Db) {
  const totals = db.prepare("SELECT COUNT(*) AS pages, COALESCE(SUM(visits),0) AS visits, COUNT(DISTINCT domain) AS domains FROM pages").get();
  const topDomains = db
    .prepare("SELECT domain, COUNT(*) AS pages FROM pages GROUP BY domain ORDER BY pages DESC LIMIT 10")
    .all();
  return { ...(totals as object), topDomains };
}

export function addBlock(db: Db, domain: string) {
  const d = domain.toLowerCase().trim().replace(/^www\./, "");
  db.prepare("INSERT OR IGNORE INTO blocklist (domain) VALUES (?)").run(d);
  // Also purge anything already indexed from that domain.
  db.prepare("DELETE FROM pages WHERE domain = ? OR domain LIKE ?").run(d, `%.${d}`);
}
