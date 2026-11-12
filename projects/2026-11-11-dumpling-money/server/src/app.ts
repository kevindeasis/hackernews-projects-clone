import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { cashFlow, netWorthSeries, parseCsv, spendingByCategory, toCents } from "./finance.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountIn = z.object({ name: z.string().min(1), kind: z.enum(["asset", "liability"]), opening: z.number().default(0) });
const txIn = z.object({
  account_id: z.number().int(),
  date,
  amount: z.number(), // dollars, signed
  category: z.string().min(1).default("Uncategorized"),
  description: z.string().default(""),
});
const range = z.object({ from: date.optional(), to: date.optional() });

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.text({ type: "text/csv", limit: "5mb" }));

  const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => {
    try { fn(req, res, next); } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
      res.status(400).json({ error: msg });
    }
  };

  app.get("/api/accounts", wrap((_req, res) => {
    res.json(db.prepare(
      `SELECT a.id, a.name, a.kind, a.opening_cents,
              a.opening_cents + COALESCE(SUM(t.amount_cents), 0) AS balance_cents
       FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id GROUP BY a.id ORDER BY a.kind, a.name`).all());
  }));

  app.post("/api/accounts", wrap((req, res) => {
    const a = accountIn.parse(req.body);
    const info = db.prepare("INSERT INTO accounts (name, kind, opening_cents) VALUES (?,?,?)").run(a.name, a.kind, toCents(a.opening));
    res.status(201).json({ id: info.lastInsertRowid });
  }));

  app.delete("/api/accounts/:id", wrap((req, res) => {
    db.prepare("DELETE FROM accounts WHERE id = ?").run(Number(req.params.id));
    res.status(204).end();
  }));

  app.get("/api/transactions", wrap((req, res) => {
    const q = String(req.query.q ?? "");
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    res.json(db.prepare(
      `SELECT t.id, t.account_id, a.name AS account, t.date, t.amount_cents, t.category, t.description
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE (? = '' OR t.description LIKE '%' || ? || '%' OR t.category LIKE '%' || ? || '%')
       ORDER BY t.date DESC, t.id DESC LIMIT ?`).all(q, q, q, limit));
  }));

  app.post("/api/transactions", wrap((req, res) => {
    const t = txIn.parse(req.body);
    const info = db.prepare("INSERT INTO transactions (account_id,date,amount_cents,category,description) VALUES (?,?,?,?,?)")
      .run(t.account_id, t.date, toCents(t.amount), t.category, t.description);
    res.status(201).json({ id: info.lastInsertRowid });
  }));

  app.delete("/api/transactions/:id", wrap((req, res) => {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(Number(req.params.id));
    res.status(204).end();
  }));

  app.post("/api/accounts/:id/import", wrap((req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id)) { res.status(404).json({ error: "No such account" }); return; }
    const rows = parseCsv(typeof req.body === "string" ? req.body : "");
    const ins = db.prepare("INSERT INTO transactions (account_id,date,amount_cents,category,description) VALUES (?,?,?,?,?)");
    db.transaction(() => rows.forEach((r) => ins.run(id, r.date, r.amount_cents, r.category, r.description)))();
    res.status(201).json({ imported: rows.length });
  }));

  app.get("/api/reports/cashflow", wrap((req, res) => { const r = range.parse(req.query); res.json(cashFlow(db, r.from, r.to)); }));
  app.get("/api/reports/categories", wrap((req, res) => { const r = range.parse(req.query); res.json(spendingByCategory(db, r.from, r.to)); }));
  app.get("/api/reports/networth", wrap((_req, res) => res.json(netWorthSeries(db))));

  return app;
}
