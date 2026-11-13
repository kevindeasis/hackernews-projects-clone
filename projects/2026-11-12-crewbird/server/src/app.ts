import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { STATUSES, canTransition, overlaps, summarize, type Status } from "./logic.js";

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(""),
  email: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
});
const jobSchema = z.object({
  customer_id: z.number().int(),
  technician_id: z.number().int().nullable().default(null),
  title: z.string().min(1),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  duration_min: z.number().int().positive().default(60),
  price_cents: z.number().int().min(0).default(0),
});
const leadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(""),
  email: z.string().default(""),
  address: z.string().default(""),
  request: z.string().min(1),
});

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => {
    try { fn(req, res, next); } catch (e) {
      if (e instanceof z.ZodError) res.status(400).json({ error: e.issues });
      else next(e);
    }
  };

  const JOB_SQL = `SELECT j.*, c.name AS customer_name, c.address AS customer_address, t.name AS technician_name
    FROM jobs j JOIN customers c ON c.id = j.customer_id LEFT JOIN technicians t ON t.id = j.technician_id`;

  app.get("/api/customers", wrap((_req, res) => {
    res.json(db.prepare("SELECT * FROM customers ORDER BY name").all());
  }));
  app.post("/api/customers", wrap((req, res) => {
    const c = customerSchema.parse(req.body);
    const r = db.prepare("INSERT INTO customers (name, phone, email, address, notes) VALUES (@name,@phone,@email,@address,@notes)").run(c);
    res.status(201).json({ id: r.lastInsertRowid, ...c });
  }));
  app.get("/api/customers/:id", wrap((req, res) => {
    const c = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!c) return void res.status(404).json({ error: "not found" });
    res.json({ ...c, jobs: db.prepare(`${JOB_SQL} WHERE j.customer_id = ? ORDER BY j.id DESC`).all(req.params.id) });
  }));

  app.get("/api/technicians", wrap((_req, res) => {
    res.json(db.prepare("SELECT * FROM technicians ORDER BY name").all());
  }));
  app.post("/api/technicians", wrap((req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const r = db.prepare("INSERT INTO technicians (name) VALUES (?)").run(name);
    res.status(201).json({ id: r.lastInsertRowid, name });
  }));

  app.get("/api/jobs", wrap((req, res) => {
    const { date, status } = req.query;
    const where: string[] = [], args: unknown[] = [];
    if (typeof date === "string") { where.push("j.scheduled_date = ?"); args.push(date); }
    if (typeof status === "string") { where.push("j.status = ?"); args.push(status); }
    const sql = `${JOB_SQL}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY j.scheduled_date, j.scheduled_time, j.id`;
    res.json(db.prepare(sql).all(...args));
  }));

  app.post("/api/jobs", wrap((req, res) => {
    const j = jobSchema.parse(req.body);
    const status: Status = j.scheduled_date ? "scheduled" : "lead";
    const conflict = findConflict(db, j);
    if (conflict) return void res.status(409).json({ error: "Technician is already booked then", conflict });
    const r = db.prepare(`INSERT INTO jobs (customer_id, technician_id, title, status, scheduled_date, scheduled_time, duration_min, price_cents)
      VALUES (@customer_id,@technician_id,@title,@status,@scheduled_date,@scheduled_time,@duration_min,@price_cents)`).run({ ...j, status });
    res.status(201).json(db.prepare(`${JOB_SQL} WHERE j.id = ?`).get(r.lastInsertRowid));
  }));

  // Schedule / reassign / reprice a job.
  app.patch("/api/jobs/:id", wrap((req, res) => {
    const cur = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id) as any;
    if (!cur) return void res.status(404).json({ error: "not found" });
    const patch = jobSchema.omit({ customer_id: true }).partial().parse(req.body);
    const next = { ...cur, ...patch };
    const conflict = findConflict(db, next, cur.id);
    if (conflict) return void res.status(409).json({ error: "Technician is already booked then", conflict });
    if (cur.status === "lead" && next.scheduled_date) next.status = "scheduled";
    db.prepare(`UPDATE jobs SET technician_id=@technician_id, title=@title, status=@status, scheduled_date=@scheduled_date,
      scheduled_time=@scheduled_time, duration_min=@duration_min, price_cents=@price_cents WHERE id=@id`).run(next);
    res.json(db.prepare(`${JOB_SQL} WHERE j.id = ?`).get(cur.id));
  }));

  app.post("/api/jobs/:id/status", wrap((req, res) => {
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const cur = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id) as any;
    if (!cur) return void res.status(404).json({ error: "not found" });
    if (!canTransition(cur.status, status)) return void res.status(400).json({ error: `Cannot go from ${cur.status} to ${status}` });
    if (status === "scheduled" && !cur.scheduled_date) return void res.status(400).json({ error: "Set a date first" });
    db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(status, cur.id);
    res.json(db.prepare(`${JOB_SQL} WHERE j.id = ?`).get(cur.id));
  }));

  // Public lead intake (stand-in for the Google Local Service Ads integration).
  app.post("/api/leads", wrap((req, res) => {
    const l = leadSchema.parse(req.body);
    const tx = db.transaction(() => {
      const existing = l.email || l.phone
        ? (db.prepare("SELECT id FROM customers WHERE (email != '' AND email = ?) OR (phone != '' AND phone = ?)").get(l.email, l.phone) as { id: number } | undefined)
        : undefined;
      const customerId = existing?.id ?? Number(db.prepare("INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)").run(l.name, l.phone, l.email, l.address).lastInsertRowid);
      const job = db.prepare("INSERT INTO jobs (customer_id, title, status, source) VALUES (?,?, 'lead', 'lead_form')").run(customerId, l.request);
      return Number(job.lastInsertRowid);
    });
    res.status(201).json(db.prepare(`${JOB_SQL} WHERE j.id = ?`).get(tx()));
  }));

  app.get("/api/summary", wrap((_req, res) => {
    res.json(summarize(db.prepare("SELECT status, price_cents FROM jobs").all() as any));
  }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });
  return app;
}

function findConflict(db: Db, job: any, ignoreId?: number) {
  if (!job.technician_id || !job.scheduled_date || !job.scheduled_time) return null;
  const others = db.prepare("SELECT * FROM jobs WHERE technician_id = ? AND scheduled_date = ? AND id != ? AND status != 'paid'")
    .all(job.technician_id, job.scheduled_date, ignoreId ?? -1) as any[];
  return others.find((o) => overlaps(job, o)) ?? null;
}
