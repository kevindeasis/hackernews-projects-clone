import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { effectiveReps, epley, fitCurve, frontier, prescribe, round, sampleCurve, type SetPoint } from "./curve.js";
import type { Store, StoredSet } from "./store.js";

const today = () => new Date().toISOString().slice(0, 10);

const exerciseSchema = z.object({ name: z.string().trim().min(1).max(80) });
const setSchema = z.object({
  weight: z.number().positive().max(2000),
  reps: z.number().int().min(1).max(100),
  rpe: z.number().min(1).max(10).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const settingsSchema = z.object({
  unit: z.enum(["kg", "lb"]).optional(),
  increment: z.number().positive().max(50).optional(),
  rir: z.number().int().min(0).max(5).optional(),
});

const toPoints = (sets: StoredSet[]): SetPoint[] => sets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe, date: s.date }));

export function createApp(store: Store, staticDir?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const summary = (id: number) => {
    const sets = store.listSets(id);
    const settings = store.getSettings();
    const fit = fitCurve(toPoints(sets));
    return {
      sets,
      fit,
      prescription: fit ? prescribe(fit, settings) : [],
      lastDate: sets.length ? sets[sets.length - 1].date : null,
    };
  };

  app.get("/api/settings", (_req, res) => res.json(store.getSettings()));
  app.put("/api/settings", (req, res) => res.json(store.saveSettings(settingsSchema.parse(req.body))));

  app.get("/api/exercises", (_req, res) => {
    res.json(
      store.listExercises().map((e) => {
        const { sets, fit, lastDate } = summary(e.id);
        return { ...e, setCount: sets.length, e1rm: fit?.e1rm ?? null, lastDate };
      }),
    );
  });

  app.post("/api/exercises", (req, res) => {
    const { name } = exerciseSchema.parse(req.body);
    try {
      res.status(201).json(store.addExercise(name));
    } catch {
      res.status(409).json({ error: "An exercise with that name already exists" });
    }
  });

  app.delete("/api/exercises/:id", (req, res) => {
    store.deleteExercise(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: "Not found" });
  });

  /** Everything the exercise page needs: sets, fitted curve, prescription, chart series. */
  app.get("/api/exercises/:id", (req, res) => {
    const exercise = store.getExercise(Number(req.params.id));
    if (!exercise) return res.status(404).json({ error: "Not found" });
    const { sets, fit, prescription } = summary(exercise.id);
    const front = new Set(frontier(sets).map((s) => s.id));
    const byDate = new Map<string, number>();
    for (const s of sets) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, epley(s.weight, effectiveReps(s))));
    res.json({
      exercise,
      settings: store.getSettings(),
      sets: sets.map((s) => ({ ...s, onFrontier: front.has(s.id) })),
      fit,
      prescription,
      curve: fit ? sampleCurve(fit) : [],
      e1rmHistory: [...byDate].map(([date, e1rm]) => ({ date, e1rm: round(e1rm, 1) })),
    });
  });

  app.post("/api/exercises/:id/sets", (req, res) => {
    const exercise = store.getExercise(Number(req.params.id));
    if (!exercise) return res.status(404).json({ error: "Not found" });
    const b = setSchema.parse(req.body);
    res.status(201).json(
      store.addSet({ exercise_id: exercise.id, weight: b.weight, reps: b.reps, rpe: b.rpe ?? null, date: b.date ?? today() }),
    );
  });

  app.delete("/api/sets/:id", (req, res) => {
    store.deleteSet(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: "Not found" });
  });

  /** Today's plan: a prescription for every exercise that has enough history. */
  app.get("/api/plan", (_req, res) => {
    const settings = store.getSettings();
    res.json({
      settings,
      exercises: store.listExercises().map((e) => ({ id: e.id, name: e.name, ...summary(e.id), sets: undefined })),
    });
  });

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}
