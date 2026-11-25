import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { parseBbox } from "./geo.js";
import {
  addTree, cityStats, getCity, importCsv, listCities, listTrees, newTreeSchema, nextToReview, patchSchema, patchTree,
} from "./trees.js";

const treesQuery = z.object({
  bbox: z.string().optional(),
  status: z.enum(["detected", "confirmed", "rejected"]).optional(),
  species: z.string().max(80).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(20000).optional(),
});

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.text({ type: "text/csv", limit: "10mb" }));

  app.get("/api/cities", (_req, res) => res.json(listCities(db)));

  app.get("/api/cities/:slug", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    res.json(city);
  });

  app.get("/api/cities/:slug/trees", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    const q = treesQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: "invalid query" });
    const bbox = q.data.bbox ? parseBbox(q.data.bbox) : undefined;
    if (q.data.bbox && !bbox) return res.status(400).json({ error: "invalid bbox" });
    res.json(listTrees(db, city.id, { ...q.data, bbox: bbox ?? undefined }));
  });

  app.get("/api/cities/:slug/stats", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    const bbox = parseBbox(String(req.query.bbox ?? ""));
    if (!bbox) return res.status(400).json({ error: "bbox=south,west,north,east required" });
    res.json(cityStats(db, city.id, bbox));
  });

  app.get("/api/cities/:slug/review/next", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    const t = nextToReview(db, city.id);
    if (!t) return res.status(404).json({ error: "review queue empty" });
    res.json(t);
  });

  app.post("/api/cities/:slug/trees", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    const b = newTreeSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "invalid tree" });
    res.status(201).json(addTree(db, city.id, b.data));
  });

  app.post("/api/cities/:slug/import", (req, res) => {
    const city = getCity(db, req.params.slug);
    if (!city) return res.status(404).json({ error: "city not found" });
    if (typeof req.body !== "string" || !req.body.trim()) {
      return res.status(400).json({ error: "send CSV text with Content-Type: text/csv" });
    }
    res.json(importCsv(db, city.id, req.body));
  });

  app.patch("/api/trees/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid id" });
    const b = patchSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "invalid patch" });
    const t = patchTree(db, id, b.data);
    if (!t) return res.status(404).json({ error: "not found" });
    res.json(t);
  });

  return app;
}
