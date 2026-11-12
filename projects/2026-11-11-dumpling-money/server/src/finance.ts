import { parse } from "csv-parse/sync";
import type { Db } from "./db.js";

/** Category name for movements between own accounts; excluded from cash flow. */
export const TRANSFER = "Transfer";

export interface MonthFlow { month: string; income: number; expenses: number; net: number }
export interface NetWorthPoint { month: string; assets: number; liabilities: number; netWorth: number }
export interface CategoryTotal { category: string; total: number }

export function toCents(value: string | number): number {
  const s = String(value).replace(/[^0-9.\-()]/g, "");
  const neg = s.startsWith("(") || s.startsWith("-");
  const n = Math.round(parseFloat(s.replace(/[()\-]/g, "")) * 100);
  if (Number.isNaN(n)) throw new Error(`Invalid amount: ${value}`);
  return neg ? -n : n;
}

/** Income vs expenses per month (cents). Transfers are ignored. */
export function cashFlow(db: Db, from?: string, to?: string): MonthFlow[] {
  const rows = db
    .prepare(
      `SELECT substr(date,1,7) AS month,
              SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income,
              -SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END) AS expenses
       FROM transactions
       WHERE category != ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       GROUP BY month ORDER BY month`,
    )
    .all(TRANSFER, from ?? null, from ?? null, to ?? null, to ?? null) as { month: string; income: number; expenses: number }[];
  return rows.map((r) => ({ ...r, net: r.income - r.expenses }));
}

/** Spending per category (positive cents), largest first. */
export function spendingByCategory(db: Db, from?: string, to?: string): CategoryTotal[] {
  return db
    .prepare(
      `SELECT category, -SUM(amount_cents) AS total FROM transactions
       WHERE amount_cents < 0 AND category != ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       GROUP BY category ORDER BY total DESC`,
    )
    .all(TRANSFER, from ?? null, from ?? null, to ?? null, to ?? null) as CategoryTotal[];
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Month-end net worth: sum of (opening + transactions up to month end) per account, split by kind. */
export function netWorthSeries(db: Db): NetWorthPoint[] {
  const first = db.prepare("SELECT MIN(date) AS d FROM transactions").get() as { d: string | null };
  if (!first.d) return [];
  const now = new Date().toISOString().slice(0, 7);
  const last = (db.prepare("SELECT MAX(date) AS d FROM transactions").get() as { d: string }).d.slice(0, 7);
  const end = last > now ? last : now;
  const stmt = db.prepare(
    `SELECT a.kind AS kind, SUM(a.opening_cents + COALESCE((
        SELECT SUM(t.amount_cents) FROM transactions t WHERE t.account_id = a.id AND t.date <= ?), 0)) AS total
     FROM accounts a GROUP BY a.kind`,
  );
  return monthsBetween(first.d.slice(0, 7), end).map((month) => {
    const rows = stmt.all(lastDayOfMonth(month)) as { kind: string; total: number }[];
    const assets = rows.find((r) => r.kind === "asset")?.total ?? 0;
    const liabilities = rows.find((r) => r.kind === "liability")?.total ?? 0;
    return { month, assets, liabilities, netWorth: assets + liabilities };
  });
}

export interface ParsedRow { date: string; amount_cents: number; description: string; category: string }

/**
 * Parse a bank CSV. Needs a date column, a description column and either a single
 * `amount` column or separate `debit`/`credit` columns (header names are matched loosely).
 */
export function parseCsv(text: string): ParsedRow[] {
  const records = parse(text, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const pick = (r: Record<string, string>, names: string[]) => names.map((n) => r[n]).find((v) => v !== undefined && v !== "");
  return records.map((r, i) => {
    const date = pick(r, ["date", "posted date", "transaction date"]);
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) throw new Error(`Row ${i + 1}: date must be YYYY-MM-DD`);
    let cents: number;
    const amount = pick(r, ["amount"]);
    if (amount !== undefined) cents = toCents(amount);
    else {
      const debit = pick(r, ["debit", "withdrawal"]);
      const credit = pick(r, ["credit", "deposit"]);
      if (debit === undefined && credit === undefined) throw new Error(`Row ${i + 1}: no amount/debit/credit column`);
      cents = (credit ? toCents(credit) : 0) - (debit ? Math.abs(toCents(debit)) : 0);
    }
    return {
      date: date.slice(0, 10),
      amount_cents: cents,
      description: pick(r, ["description", "memo", "payee", "name"]) ?? "",
      category: pick(r, ["category"]) ?? categorize(pick(r, ["description", "memo", "payee", "name"]) ?? "", cents),
    };
  });
}

const RULES: [RegExp, string][] = [
  [/grocer|supermarket|whole foods|trader joe|aldi|safeway/i, "Groceries"],
  [/restaurant|cafe|coffee|starbucks|doordash|uber eats|pizza/i, "Dining"],
  [/uber|lyft|metro|transit|fuel|shell|chevron|parking/i, "Transport"],
  [/rent|mortgage|landlord/i, "Housing"],
  [/netflix|spotify|subscription|hulu|disney/i, "Subscriptions"],
  [/electric|water|gas bill|internet|comcast|verizon|t-mobile/i, "Utilities"],
  [/salary|payroll|direct dep/i, "Salary"],
  [/transfer/i, TRANSFER],
];

/** Tiny keyword-based auto-categoriser used for CSV imports without a category column. */
export function categorize(description: string, cents: number): string {
  for (const [re, cat] of RULES) if (re.test(description)) return cat;
  return cents > 0 ? "Income" : "Uncategorized";
}
