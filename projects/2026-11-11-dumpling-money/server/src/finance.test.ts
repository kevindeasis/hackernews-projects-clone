import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb, type Db } from "./db.js";
import { cashFlow, categorize, monthsBetween, netWorthSeries, parseCsv, spendingByCategory, toCents } from "./finance.js";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  db.prepare("INSERT INTO accounts (name,kind,opening_cents) VALUES ('Chk','asset',100000),('Card','liability',-20000)").run();
  const ins = db.prepare("INSERT INTO transactions (account_id,date,amount_cents,category,description) VALUES (?,?,?,?,?)");
  ins.run(1, "2026-01-01", 300000, "Salary", "pay");
  ins.run(1, "2026-01-10", -50000, "Housing", "rent");
  ins.run(2, "2026-02-03", -12000, "Dining", "dinner");
  ins.run(1, "2026-02-05", -10000, "Transfer", "to card");
  ins.run(2, "2026-02-05", 10000, "Transfer", "from chk");
});

describe("helpers", () => {
  it("parses money", () => {
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents("(12.50)")).toBe(-1250);
    expect(toCents(-3.1)).toBe(-310);
    expect(() => toCents("abc")).toThrow();
  });
  it("lists months", () => expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]));
  it("categorizes", () => {
    expect(categorize("STARBUCKS #12", -500)).toBe("Dining");
    expect(categorize("mystery", 500)).toBe("Income");
  });
});

describe("reports", () => {
  it("cash flow ignores transfers", () => {
    expect(cashFlow(db)).toEqual([
      { month: "2026-01", income: 300000, expenses: 50000, net: 250000 },
      { month: "2026-02", income: 0, expenses: 12000, net: -12000 },
    ]);
  });
  it("spending by category", () => {
    expect(spendingByCategory(db)).toEqual([{ category: "Housing", total: 50000 }, { category: "Dining", total: 12000 }]);
  });
  it("net worth includes transfers (they cancel out) and opening balances", () => {
    const s = netWorthSeries(db);
    expect(s[0]).toMatchObject({ month: "2026-01", assets: 350000, liabilities: -20000, netWorth: 330000 });
    expect(s[1]).toMatchObject({ month: "2026-02", assets: 340000, liabilities: -22000, netWorth: 318000 });
  });
});

describe("csv import", () => {
  it("handles amount column", () => {
    const rows = parseCsv("Date,Description,Amount\n2026-03-01,Whole Foods,-45.10\n2026-03-02,Payroll,2000");
    expect(rows.map((r) => [r.amount_cents, r.category])).toEqual([[-4510, "Groceries"], [200000, "Salary"]]);
  });
  it("handles debit/credit columns", () => {
    const rows = parseCsv("date,memo,debit,credit\n2026-03-01,Rent,1500,\n2026-03-02,Refund,,20");
    expect(rows.map((r) => r.amount_cents)).toEqual([-150000, 2000]);
  });
  it("rejects bad dates", () => expect(() => parseCsv("date,amount\n03/01/2026,5")).toThrow(/YYYY-MM-DD/));
});

describe("api", () => {
  it("creates accounts and transactions and imports csv", async () => {
    const app = createApp(db);
    const a = await request(app).post("/api/accounts").send({ name: "Cash", kind: "asset", opening: 10 });
    expect(a.status).toBe(201);
    const t = await request(app).post("/api/transactions").send({ account_id: a.body.id, date: "2026-03-01", amount: -2.5, category: "Dining" });
    expect(t.status).toBe(201);
    const imp = await request(app).post(`/api/accounts/${a.body.id}/import`).set("Content-Type", "text/csv").send("date,description,amount\n2026-03-02,Coffee,-3");
    expect(imp.body).toEqual({ imported: 1 });
    const accts = await request(app).get("/api/accounts");
    expect(accts.body.find((x: { name: string }) => x.name === "Cash").balance_cents).toBe(1000 - 250 - 300);
    expect((await request(app).post("/api/transactions").send({ account_id: 1, date: "bad", amount: 1 })).status).toBe(400);
    expect((await request(app).post("/api/accounts/999/import").set("Content-Type", "text/csv").send("date,amount\n2026-01-01,1")).status).toBe(404);
  });
});
