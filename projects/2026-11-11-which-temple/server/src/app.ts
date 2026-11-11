import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { facets, getTemple, listTemples, randomTemple } from "./temples.js";

const filterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.string().max(60).optional(),
  tradition: z.string().max(60).optional(),
});

export function createApp(db: Db) {
  const app = express();
  app.use(cors());

  app.get("/api/temples", (req, res) => {
    const f = filterSchema.safeParse(req.query);
    if (!f.success) return res.status(400).json({ error: "invalid query" });
    res.json(listTemples(db, f.data));
  });

  // Declared before /:id so "random" is not parsed as an id.
  app.get("/api/temples/random", (req, res) => {
    const f = filterSchema.safeParse(req.query);
    if (!f.success) return res.status(400).json({ error: "invalid query" });
    const t = randomTemple(db, f.data);
    if (!t) return res.status(404).json({ error: "no temples match" });
    res.json(t);
  });

  app.get("/api/temples/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid id" });
    const t = getTemple(db, id);
    if (!t) return res.status(404).json({ error: "not found" });
    res.json(t);
  });

  app.get("/api/facets", (_req, res) => res.json(facets(db)));
  return app;
}
