// Demo data (synthetic - NOT real lab results). Run: npm run seed -w server
import fs from "node:fs";
import path from "node:path";
import { openDb } from "./db.js";
import * as s from "./store.js";

const dbPath = process.env.DB_PATH ?? "./data/lab.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
if ((db.prepare("SELECT COUNT(*) c FROM products").get() as { c: number }).c > 0) {
  console.log("Database already has data; skipping seed.");
  process.exit(0);
}
const now = new Date();
const mk = (name: string, brand: string, category: string, goal: number, description: string) => {
  const p = s.suggestProduct(db, now, { name, brand, category, description });
  return s.approveProduct(db, p.id, goal, now);
};
const a = mk("Greek Yogurt 32oz", "Example Dairy", "Dairy", 150_000, "Sold in plastic tubs; test for phthalates and bisphenols.");
const b = mk("Cold-Pressed Juice", "Demo Juicery", "Beverages", 120_000, "Bottled in PET.");
const c = mk("Baby Food Pouch", "Sample Kids", "Baby", 90_000, "Squeeze pouches with plastic spout.");
s.suggestProduct(db, now, { name: "Takeout Soup Container", brand: "Sample Deli", category: "Food service" });
s.addPledge(db, a.id, now, { name: "Ada Lovelace", email: "ada@example.com", amount_cents: 5000 });
s.addPledge(db, a.id, now, { name: "Alan Turing", email: "alan@example.com", amount_cents: 2500 });
s.addPledge(db, b.id, now, { name: "Grace Hopper", email: "grace@example.com", amount_cents: 120_000 }); // fully funded
s.publishResults(
  db,
  b.id,
  ["A", "B", "C"].flatMap((lot, i) => [
    { lot, analyte: "DEHP", value_ng_g: [12.4, null, 8.1][i], loq_ng_g: 5 },
    { lot, analyte: "Bisphenol A", value_ng_g: null, loq_ng_g: 2 },
    { lot, analyte: "DBP", value_ng_g: [null, 6.2, 7.7][i], loq_ng_g: 5 },
  ]),
  now,
);
s.addPledge(db, c.id, now, { name: "Katherine Johnson", email: "kj@example.com", amount_cents: 9000 });
console.log("Seeded.");
