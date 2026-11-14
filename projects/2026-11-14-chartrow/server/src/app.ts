import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { PERIODS, drawdownSeries, maxDrawdown, parsePriceCsv, periodReturn, type PricePoint } from "./logic.js";

interface SecRow {
  symbol: string;
  name: string;
  kind: "stock" | "etf";
  sector: string;
  market_cap: number;
}

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  const prices = (symbol: string, from?: string): PricePoint[] =>
    db
      .prepare("SELECT date, close FROM prices WHERE symbol = ? AND date >= ? ORDER BY date")
      .all(symbol, from ?? "0000-00-00") as PricePoint[];

  app.get("/api/securities", (_req, res) => {
    res.json(db.prepare("SELECT * FROM securities ORDER BY kind DESC, symbol").all());
  });

  // Price history + underwater series + max drawdown. ?range=3m|6m|1y|3y|max
  app.get("/api/securities/:symbol/drawdown", (req, res) => {
    const sec = db.prepare("SELECT * FROM securities WHERE symbol = ?").get(req.params.symbol.toUpperCase()) as SecRow | undefined;
    if (!sec) return res.status(404).json({ error: "Unknown symbol" });
    const all = prices(sec.symbol);
    const range = String(req.query.range ?? "max");
    const days = range === "3y" ? 1095 : PERIODS[range];
    let series = all;
    if (days && all.length) {
      const cutoff = new Date(all[all.length - 1].date);
      cutoff.setUTCDate(cutoff.getUTCDate() - days);
      series = all.filter((p) => p.date >= cutoff.toISOString().slice(0, 10));
    }
    res.json({ security: sec, series: drawdownSeries(series), max: maxDrawdown(series) });
  });

  // Performance heatmap: every stock sized by market cap, coloured by return over ?period=
  app.get("/api/heatmap", (req, res) => {
    const period = String(req.query.period ?? "1m");
    const days = PERIODS[period];
    if (!days) return res.status(400).json({ error: `period must be one of ${Object.keys(PERIODS).join(", ")}` });
    const stocks = db.prepare("SELECT * FROM securities WHERE kind = 'stock'").all() as SecRow[];
    const items = stocks
      .map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, marketCap: s.market_cap, ret: periodReturn(prices(s.symbol), days) }))
      .filter((i) => i.ret !== null);
    res.json({ period, items });
  });

  // ETF holdings with per-holding return and weighted contribution.
  app.get("/api/etfs/:symbol/holdings", (req, res) => {
    const etf = db.prepare("SELECT * FROM securities WHERE symbol = ? AND kind = 'etf'").get(req.params.symbol.toUpperCase()) as SecRow | undefined;
    if (!etf) return res.status(404).json({ error: "Unknown ETF" });
    const period = String(req.query.period ?? "3m");
    const days = PERIODS[period] ?? 91;
    const rows = db
      .prepare("SELECT h.symbol, h.weight, s.name, s.sector FROM holdings h JOIN securities s ON s.symbol = h.symbol WHERE h.etf = ? ORDER BY h.weight DESC")
      .all(etf.symbol) as { symbol: string; weight: number; name: string; sector: string }[];
    const holdings = rows.map((r) => {
      const ret = periodReturn(prices(r.symbol), days);
      return { ...r, ret, contribution: ret === null ? null : ret * r.weight };
    });
    res.json({ etf, period, holdings, etfReturn: periodReturn(prices(etf.symbol), days) });
  });

  // Import real history for a symbol (creates it if needed): { symbol, name?, csv }
  const importSchema = z.object({ symbol: z.string().min(1).max(12), name: z.string().optional(), csv: z.string().min(1) });
  app.post("/api/import", (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    let pts: PricePoint[];
    try {
      pts = parsePriceCsv(parsed.data.csv);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    if (pts.length < 2) return res.status(400).json({ error: "Need at least 2 price rows" });
    const symbol = parsed.data.symbol.toUpperCase();
    db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO securities (symbol,name,kind,sector,market_cap) VALUES (?,?,'stock','Imported',1)").run(symbol, parsed.data.name ?? symbol);
      const ins = db.prepare("INSERT OR REPLACE INTO prices (symbol,date,close) VALUES (?,?,?)");
      for (const p of pts) ins.run(symbol, p.date, p.close);
    })();
    res.status(201).json({ symbol, rows: pts.length });
  });

  return app;
}
