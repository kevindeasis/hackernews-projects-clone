import express from "express";
import cors from "cors";
import { z } from "zod";
import type { DB } from "./db.js";
import { listAreas, listCinemas, listFilms, listFormats, searchShowtimes } from "./showtimes.js";

const querySchema = z.object({
  area: z.string().optional(),
  cinemaId: z.coerce.number().int().positive().optional(),
  filmId: z.coerce.number().int().positive().optional(),
  format: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  after: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export function createApp(db: DB) {
  const app = express();
  app.use(cors());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/filters", (_req, res) =>
    res.json({ areas: listAreas(db), cinemas: listCinemas(db), films: listFilms(db), formats: listFormats(db) }),
  );
  app.get("/api/showtimes", (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(searchShowtimes(db, parsed.data));
  });
  return app;
}
