import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { drawdownSeries, maxDrawdown, parsePriceCsv, periodReturn, syntheticPrices } from "./logic.js";
import { seed } from "./seed.js";

const pts = (closes: number[]) => closes.map((close, i) => ({ date: `2024-01-${String(i + 1).padStart(2, "0")}`, close }));

describe("drawdown logic", () => {
  it("computes running-peak drawdown", () => {
    const s = drawdownSeries(pts([100, 120, 90, 120, 130]));
    expect(s.map((p) => Math.round(p.drawdown * 1000) / 1000)).toEqual([0, 0, -0.25, 0, 0]);
  });
  it("finds max drawdown with recovery", () => {
    const m = maxDrawdown(pts([100, 120, 90, 60, 125]))!;
    expect(m.depth).toBeCloseTo(-0.5);
    expect(m.peakDate).toBe("2024-01-02");
    expect(m.troughDate).toBe("2024-01-04");
    expect(m.recoveryDate).toBe("2024-01-05");
  });
  it("reports null recovery when never regained", () => {
    expect(maxDrawdown(pts([100, 50, 60]))!.recoveryDate).toBeNull();
  });
  it("computes period returns", () => {
    expect(periodReturn(pts([100, 110, 121]), 1)).toBeCloseTo(0.1);
    expect(periodReturn(pts([100, 110]), 365)).toBeNull();
  });
});

describe("csv + synthetic data", () => {
  it("parses headered CSV, preferring Adj Close", () => {
    const r = parsePriceCsv("Date,Close,Adj Close\n2024-01-02,10,9\n2024-01-01,8,7");
    expect(r).toEqual([{ date: "2024-01-01", close: 7 }, { date: "2024-01-02", close: 9 }]);
  });
  it("rejects bad rows", () => {
    expect(() => parsePriceCsv("2024-01-01,abc")).toThrow();
  });
  it("is deterministic", () => {
    expect(syntheticPrices(1, "2024-06-03", 50, 100, 0.1, 0.2)).toEqual(syntheticPrices(1, "2024-06-03", 50, 100, 0.1, 0.2));
  });
});

describe("api", () => {
  const db = openDb(":memory:");
  seed(db, "2026-11-13");
  const app = createApp(db);

  it("lists securities", async () => {
    const r = await request(app).get("/api/securities");
    expect(r.body.length).toBeGreaterThan(20);
  });
  it("returns drawdown data", async () => {
    const r = await request(app).get("/api/securities/nvda/drawdown?range=1y");
    expect(r.status).toBe(200);
    expect(r.body.series.every((p: { drawdown: number }) => p.drawdown <= 0)).toBe(true);
    expect(r.body.max.depth).toBeLessThanOrEqual(0);
  });
  it("returns heatmap and validates period", async () => {
    expect((await request(app).get("/api/heatmap?period=1m")).body.items.length).toBeGreaterThan(20);
    expect((await request(app).get("/api/heatmap?period=zz")).status).toBe(400);
  });
  it("returns ETF holdings summing to weight 1", async () => {
    const r = await request(app).get("/api/etfs/TECHX/holdings");
    const sum = r.body.holdings.reduce((a: number, h: { weight: number }) => a + h.weight, 0);
    expect(sum).toBeCloseTo(1);
  });
  it("imports CSV prices", async () => {
    const r = await request(app).post("/api/import").send({ symbol: "foo", csv: "date,close\n2024-01-01,10\n2024-01-02,9" });
    expect(r.status).toBe(201);
    const d = await request(app).get("/api/securities/FOO/drawdown");
    expect(d.body.max.depth).toBeCloseTo(-0.1);
  });
});
