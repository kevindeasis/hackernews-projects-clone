import type { Db } from "./db.js";

/** Demo data so a fresh install has something to look at. */
export function seed(db: Db) {
  const acct = db.prepare("INSERT INTO accounts (name,kind,opening_cents) VALUES (?,?,?)");
  const checking = Number(acct.run("Checking", "asset", 250000).lastInsertRowid);
  const savings = Number(acct.run("Savings", "asset", 1000000).lastInsertRowid);
  const card = Number(acct.run("Credit Card", "liability", -120000).lastInsertRowid);
  const ins = db.prepare("INSERT INTO transactions (account_id,date,amount_cents,category,description) VALUES (?,?,?,?,?)");
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = d.toISOString().slice(0, 7);
    ins.run(checking, `${ym}-01`, 420000, "Salary", "Payroll");
    ins.run(checking, `${ym}-02`, -150000, "Housing", "Rent");
    ins.run(checking, `${ym}-05`, -(8000 + i * 700), "Utilities", "Electric + internet");
    ins.run(card, `${ym}-09`, -(32000 + i * 1500), "Groceries", "Grocery store");
    ins.run(card, `${ym}-15`, -(14000 + (i % 3) * 2500), "Dining", "Restaurants");
    ins.run(card, `${ym}-20`, -1599, "Subscriptions", "Streaming");
    ins.run(checking, `${ym}-25`, -50000, "Transfer", "To savings");
    ins.run(savings, `${ym}-25`, 50000, "Transfer", "From checking");
    ins.run(checking, `${ym}-26`, -40000, "Transfer", "Pay credit card");
    ins.run(card, `${ym}-26`, 40000, "Transfer", "Payment received");
  }
}
