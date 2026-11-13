import type { Db } from "./db.js";

export function seed(db: Db) {
  const tech = db.prepare("INSERT INTO technicians (name) VALUES (?)");
  const [t1, t2] = ["Maria Lopez", "Sam Okafor"].map((n) => Number(tech.run(n).lastInsertRowid));
  const cust = db.prepare("INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)");
  const c = [
    ["Harbor Cafe", "555-0101", "ops@harborcafe.example", "12 Pier St"],
    ["J. Whitaker", "555-0102", "jw@example.com", "88 Elm Ave"],
    ["Northside Dental", "555-0103", "front@northsidedental.example", "400 Main St"],
  ].map((r) => Number(cust.run(...r).lastInsertRowid));
  const today = new Date().toISOString().slice(0, 10);
  const job = db.prepare(`INSERT INTO jobs (customer_id, technician_id, title, status, source, scheduled_date, scheduled_time, duration_min, price_cents)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  job.run(c[0], t1, "Replace water heater", "scheduled", "manual", today, "09:00", 120, 145000);
  job.run(c[1], t2, "Fix leaking faucet", "scheduled", "manual", today, "13:00", 60, 18000);
  job.run(c[2], null, "Quote: new office HVAC", "lead", "local_services_ad", null, null, 60, 0);
  job.run(c[0], t1, "Grease trap service", "done", "manual", today, "07:00", 60, 30000);
}
