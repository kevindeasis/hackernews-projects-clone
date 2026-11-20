import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Store, type Table } from "./store.js";
import { buildReport, toCsv } from "./report.js";

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");
const clientIn = z.object({ name: z.string().min(1), archived: z.boolean().optional() });
const projectIn = z.object({
  name: z.string().min(1),
  client_id: z.number().int().nullable().optional(),
  rate_cents: z.number().int().min(0).optional(),
  color: z.string().optional(),
});
const entryIn = z.object({
  project_id: z.number().int(),
  description: z.string().optional(),
  started_at: iso,
  ended_at: iso.nullable().optional(),
  billable: z.boolean().optional(),
});

const norm = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === "boolean" ? Number(v) : v])) as any;

export function createApp(store: Store, clientDist?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Generic CRUD for the three entity types; every write is recorded in history.
  const crud = (route: string, tbl: Table, schema: z.ZodObject<any>, noun: string, orderBy?: (r: any[]) => any[]) => {
    app.get(`/api/${route}`, (_req, res) => res.json(orderBy ? orderBy(store.list(tbl)) : store.list(tbl)));
    app.post(`/api/${route}`, (req, res) => {
      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });
      if (tbl === "entries" && !store.get("projects", p.data.project_id)) return res.status(400).json({ error: "unknown project" });
      res.status(201).json(store.create(tbl, norm(p.data), `Created ${noun}`));
    });
    app.patch(`/api/${route}/:id`, (req, res) => {
      const p = schema.partial().safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });
      const row = store.update(tbl, Number(req.params.id), norm(p.data), `Edited ${noun}`);
      row ? res.json(row) : res.status(404).json({ error: "not found" });
    });
    app.delete(`/api/${route}/:id`, (req, res) => {
      store.remove(tbl, Number(req.params.id), `Deleted ${noun}`) ? res.status(204).end() : res.status(404).json({ error: "not found" });
    });
  };
  crud("clients", "clients", clientIn, "client");
  crud("projects", "projects", projectIn, "project");
  crud("entries", "entries", entryIn, "time entry", (r) => [...r].sort((a, b) => b.started_at.localeCompare(a.started_at)));

  // Timer: one running entry at a time (ended_at IS NULL).
  app.get("/api/timer", (_req, res) => res.json(store.running()));
  app.post("/api/timer/start", (req, res) => {
    const p = z.object({ project_id: z.number().int(), description: z.string().optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    if (!store.get("projects", p.data.project_id)) return res.status(400).json({ error: "unknown project" });
    const now = new Date().toISOString();
    const running = store.running();
    if (running) store.update("entries", running.id as number, { ended_at: now }, "Stopped timer");
    res.status(201).json(store.create("entries", { project_id: p.data.project_id, description: p.data.description ?? "", started_at: now, ended_at: null, billable: 1 }, "Started timer"));
  });
  app.post("/api/timer/stop", (_req, res) => {
    const running = store.running();
    if (!running) return res.status(409).json({ error: "no running timer" });
    res.json(store.update("entries", running.id as number, { ended_at: new Date().toISOString() }, "Stopped timer"));
  });

  // History + undo/redo
  app.get("/api/history", (_req, res) => res.json(store.history()));
  app.post("/api/undo", (_req, res) => {
    const it = store.undo();
    it ? res.json(it) : res.status(409).json({ error: "nothing to undo" });
  });
  app.post("/api/redo", (_req, res) => {
    const it = store.redo();
    it ? res.json(it) : res.status(409).json({ error: "nothing to redo" });
  });

  // Reports + export
  const inRange = (from?: string, to?: string) =>
    store.list("entries").filter((e) => (!from || (e.started_at as string) >= from) && (!to || (e.started_at as string) <= to + "T23:59:59.999Z"));
  app.get("/api/report", (req, res) => {
    const g = z.enum(["project", "client", "day"]).catch("project").parse(req.query.groupBy);
    const entries = inRange(req.query.from as string, req.query.to as string);
    const lines = buildReport(entries, store.list("projects"), store.list("clients"), g);
    res.json({ groupBy: g, lines, totalSeconds: lines.reduce((a, l) => a + l.seconds, 0), totalCents: lines.reduce((a, l) => a + l.amountCents, 0), entries: entries.length });
  });
  app.get("/api/export.csv", (req, res) => {
    res.type("text/csv").send(toCsv(inRange(req.query.from as string, req.query.to as string), store.list("projects")));
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }
  return app;
}
