import type { Db } from "./db.js";

export const FUNDING_WINDOW_DAYS = 365;
export const REQUIRED_LOTS = 3;
export const MIN_PLEDGE_CENTS = 100;
const DAY_MS = 86_400_000;

export type Status = "suggested" | "funding" | "testing" | "complete" | "expired";

export interface ProductRow {
  id: number;
  name: string;
  brand: string;
  category: string;
  description: string;
  goal_cents: number;
  status: Status;
  created_at: string;
  deadline: string;
  funded_at: string | null;
  completed_at: string | null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function deadlineFor(created: Date): string {
  return new Date(created.getTime() + FUNDING_WINDOW_DAYS * DAY_MS).toISOString();
}

export function daysLeft(deadline: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now.getTime()) / DAY_MS));
}

/** Product row + live funding numbers. Refunded pledges don't count. */
export function withProgress(db: Db, p: ProductRow, now: Date) {
  const agg = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents),0) AS raised, COUNT(*) AS backers FROM pledges WHERE product_id=? AND refunded=0",
    )
    .get(p.id) as { raised: number; backers: number };
  return {
    ...p,
    raised_cents: agg.raised,
    backers: agg.backers,
    percent: p.goal_cents > 0 ? Math.min(100, Math.round((agg.raised / p.goal_cents) * 100)) : 0,
    days_left: p.status === "funding" ? daysLeft(p.deadline, now) : 0,
  };
}

export function getProduct(db: Db, id: number): ProductRow {
  const p = db.prepare("SELECT * FROM products WHERE id=?").get(id) as ProductRow | undefined;
  if (!p) throw new HttpError(404, "Product not found");
  return p;
}

export function listProducts(db: Db, now: Date, opts: { status?: string; q?: string } = {}) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  if (opts.q) {
    where.push("(name LIKE ? OR brand LIKE ? OR category LIKE ?)");
    const like = `%${opts.q}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC, id DESC`;
  return (db.prepare(sql).all(...args) as ProductRow[]).map((p) => withProgress(db, p, now));
}

export function suggestProduct(
  db: Db,
  now: Date,
  input: { name: string; brand: string; category: string; description?: string },
) {
  const info = db
    .prepare(
      `INSERT INTO products (name, brand, category, description, goal_cents, status, created_at, deadline)
       VALUES (?,?,?,?,?, 'suggested', ?, ?)`,
    )
    .run(input.name, input.brand, input.category, input.description ?? "", 0, now.toISOString(), deadlineFor(now));
  return getProduct(db, Number(info.lastInsertRowid));
}

/** Staff approves a suggestion: sets the funding goal and opens the 365-day window. */
export function approveProduct(db: Db, id: number, goalCents: number, now: Date) {
  const p = getProduct(db, id);
  if (p.status !== "suggested") throw new HttpError(409, "Only suggested products can be approved");
  db.prepare("UPDATE products SET status='funding', goal_cents=?, deadline=? WHERE id=?").run(
    goalCents,
    deadlineFor(now),
    id,
  );
  return getProduct(db, id);
}

export function addPledge(
  db: Db,
  id: number,
  now: Date,
  input: { name: string; email: string; amount_cents: number },
) {
  const p = getProduct(db, id);
  if (p.status !== "funding") throw new HttpError(409, `Product is not open for funding (${p.status})`);
  if (new Date(p.deadline) <= now) throw new HttpError(409, "Funding window has closed");
  if (input.amount_cents < MIN_PLEDGE_CENTS) throw new HttpError(400, "Minimum pledge is $1");
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO pledges (product_id,name,email,amount_cents,created_at) VALUES (?,?,?,?,?)").run(
      id,
      input.name,
      input.email,
      input.amount_cents,
      now.toISOString(),
    );
    const { raised } = db
      .prepare("SELECT COALESCE(SUM(amount_cents),0) AS raised FROM pledges WHERE product_id=? AND refunded=0")
      .get(id) as { raised: number };
    if (raised >= p.goal_cents) {
      db.prepare("UPDATE products SET status='testing', funded_at=? WHERE id=?").run(now.toISOString(), id);
    }
  });
  tx();
  return withProgress(db, getProduct(db, id), now);
}

/** Auto-refund: any product still funding past its deadline expires and all pledges are refunded. */
export function sweepExpired(db: Db, now: Date) {
  const expired = db
    .prepare("SELECT id FROM products WHERE status='funding' AND deadline <= ?")
    .all(now.toISOString()) as { id: number }[];
  let refunded = 0;
  const tx = db.transaction(() => {
    for (const { id } of expired) {
      db.prepare("UPDATE products SET status='expired' WHERE id=?").run(id);
      refunded += db.prepare("UPDATE pledges SET refunded=1 WHERE product_id=? AND refunded=0").run(id).changes;
    }
  });
  tx();
  return { expired: expired.length, refunded_pledges: refunded };
}

export interface Measurement {
  lot: string;
  analyte: string;
  value_ng_g: number | null;
  loq_ng_g: number;
}

/** Publish results. Protocol requires exactly three samples from different production lots. */
export function publishResults(db: Db, id: number, rows: Measurement[], now: Date) {
  const p = getProduct(db, id);
  if (p.status !== "testing") throw new HttpError(409, "Results can only be published for funded products");
  const lots = new Set(rows.map((r) => r.lot));
  if (lots.size !== REQUIRED_LOTS) throw new HttpError(400, `Results must cover exactly ${REQUIRED_LOTS} different lots`);
  const tx = db.transaction(() => {
    const ins = db.prepare("INSERT INTO results (product_id,lot,analyte,value_ng_g,loq_ng_g) VALUES (?,?,?,?,?)");
    for (const r of rows) ins.run(id, r.lot, r.analyte, r.value_ng_g, r.loq_ng_g);
    db.prepare("UPDATE products SET status='complete', completed_at=? WHERE id=?").run(now.toISOString(), id);
  });
  tx();
  return getResults(db, id);
}

export function getResults(db: Db, id: number) {
  const rows = db
    .prepare("SELECT lot, analyte, value_ng_g, loq_ng_g FROM results WHERE product_id=? ORDER BY analyte, lot")
    .all(id) as Measurement[];
  return { rows, summary: summarize(rows) };
}

/** Per-analyte roll-up across lots: detected count and max concentration. */
export function summarize(rows: Measurement[]) {
  const by = new Map<string, Measurement[]>();
  for (const r of rows) by.set(r.analyte, [...(by.get(r.analyte) ?? []), r]);
  return [...by.entries()].map(([analyte, ms]) => {
    const detected = ms.filter((m) => m.value_ng_g !== null && m.value_ng_g >= m.loq_ng_g);
    return {
      analyte,
      lots_tested: ms.length,
      lots_detected: detected.length,
      max_ng_g: detected.length ? Math.max(...detected.map((m) => m.value_ng_g as number)) : null,
    };
  });
}

export function listPledges(db: Db, id: number) {
  // Public list: first name only, no email.
  const rows = db
    .prepare("SELECT name, amount_cents, refunded, created_at FROM pledges WHERE product_id=? ORDER BY id DESC")
    .all(id) as { name: string; amount_cents: number; refunded: number; created_at: string }[];
  return rows.map((r) => ({ ...r, name: r.name.split(" ")[0] }));
}
