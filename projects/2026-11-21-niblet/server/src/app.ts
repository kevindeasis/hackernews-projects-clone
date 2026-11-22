import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import { addEntry, getSetting, listEntries, setSetting } from "./db.js";
import { allergenChecklist, foodStats, gpReport } from "./analysis.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entrySchema = z.object({
  date,
  meal: z.enum(["breakfast", "lunch", "dinner", "snack", "milk"]),
  food: z.string().trim().min(1).max(100),
  reaction: z.enum(["none", "mild", "moderate", "severe"]).optional(),
  notes: z.string().max(500).optional(),
});

export function createApp(db: Database.Database, clientDist?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/entries", (req, res) => {
    res.json(listEntries(db, req.query.from as string | undefined, req.query.to as string | undefined));
  });
  app.post("/api/entries", (req, res) => {
    const p = entrySchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    res.status(201).json(addEntry(db, p.data));
  });
  app.patch("/api/entries/:id", (req, res) => {
    const p = z.object({ reaction: z.enum(["none", "mild", "moderate", "severe"]), notes: z.string().max(500).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    const r = db.prepare("UPDATE entries SET reaction = ?, notes = COALESCE(?, notes) WHERE id = ?").run(p.data.reaction, p.data.notes ?? null, req.params.id);
    if (!r.changes) return res.status(404).json({ error: "not found" });
    res.json(db.prepare("SELECT * FROM entries WHERE id = ?").get(req.params.id));
  });
  app.delete("/api/entries/:id", (req, res) => {
    const r = db.prepare("DELETE FROM entries WHERE id = ?").run(req.params.id);
    res.status(r.changes ? 204 : 404).end();
  });

  app.get("/api/foods", (_req, res) => res.json(foodStats(listEntries(db))));
  app.get("/api/allergens", (_req, res) => res.json(allergenChecklist(listEntries(db))));

  app.get("/api/settings", (_req, res) => res.json({ babyName: getSetting(db, "babyName") }));
  app.put("/api/settings", (req, res) => {
    const p = z.object({ babyName: z.string().max(60) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    setSetting(db, "babyName", p.data.babyName);
    res.json(p.data);
  });

  app.get("/api/report", (req, res) => {
    const from = (req.query.from as string) || "0000-01-01";
    const to = (req.query.to as string) || "9999-12-31";
    const entries = listEntries(db, from, to);
    res.type("text/plain").send(gpReport(entries, getSetting(db, "babyName"), from, to));
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }
  return app;
}
