import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import { addDays, completedKeys, computeStreaks, getProgress, markComplete, saveProgress, useReveal } from "./db.js";
import { buildPuzzle, checkArrangement, revealEntry, shareText, type Puzzle } from "./puzzle.js";

export const MAX_REVEALS = 3;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const PRACTICE_KEY = /^practice-[a-z0-9]{4,12}$/;
const clientId = z.string().min(4).max(64);

const slotsSchema = z
  .array(z.object({ tile: z.number().int().min(0).max(8), rot: z.number().int().min(0).max(3) }).nullable())
  .length(9);

const today = () => new Date().toISOString().slice(0, 10);

/** Strip the solution before sending a puzzle to the browser. */
function publicPuzzle(p: Puzzle) {
  return {
    key: p.key,
    size: p.solution.length,
    tiles: p.tiles,
    tray: p.tray,
    entries: p.entries.map(({ id, number, dir, row, col, length, clue }) => ({ id, number, dir, row, col, length, clue })),
  };
}

export function createApp(db: Database.Database, clientDist?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const cache = new Map<string, Puzzle>();
  const puzzleFor = (key: string): Puzzle | null => {
    if (!DATE_KEY.test(key) && !PRACTICE_KEY.test(key)) return null;
    // Daily puzzles from the future are not available yet (one day of slack for time zones).
    if (DATE_KEY.test(key) && key > addDays(today(), 1)) return null;
    if (!cache.has(key)) cache.set(key, buildPuzzle(key));
    return cache.get(key)!;
  };

  app.get("/api/puzzles/daily", (req, res) => {
    const date = typeof req.query.date === "string" && DATE_KEY.test(req.query.date) ? req.query.date : today();
    const p = puzzleFor(date);
    if (!p) return res.status(404).json({ error: "Puzzle not available" });
    res.json(publicPuzzle(p));
  });

  app.get("/api/puzzles/:key", (req, res) => {
    const p = puzzleFor(req.params.key);
    if (!p) return res.status(404).json({ error: "Puzzle not found" });
    res.json(publicPuzzle(p));
  });

  /** Archive of past daily puzzles, newest first, 20 per page. */
  app.get("/api/archive", (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const date = typeof req.query.today === "string" && DATE_KEY.test(req.query.today) ? req.query.today : today();
    const per = 20;
    const total = 365;
    const cid = typeof req.query.clientId === "string" ? req.query.clientId : "";
    const done = new Set(cid ? completedKeys(db, cid) : []);
    const items = Array.from({ length: per }, (_, i) => addDays(date, -((page - 1) * per + i)))
      .slice(0, Math.max(0, total - (page - 1) * per))
      .map((key) => ({ key, completed: done.has(key) }));
    res.json({ page, pages: Math.ceil(total / per), items });
  });

  app.post("/api/puzzles/:key/check", (req, res) => {
    const p = puzzleFor(req.params.key);
    if (!p) return res.status(404).json({ error: "Puzzle not found" });
    const body = z.object({ slots: slotsSchema, clientId: clientId.optional(), moves: z.number().int().min(0).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const result = checkArrangement(p, body.data.slots);
    let share: string | undefined;
    if (result.solved && body.data.clientId) {
      const moves = body.data.moves ?? 0;
      markComplete(db, body.data.clientId, p.key, moves);
      const row = getProgress(db, body.data.clientId, p.key)!;
      const streak = computeStreaks(completedKeys(db, body.data.clientId), today()).current;
      share = shareText(p.key, row.moves, row.reveals, streak);
    }
    res.json({ ...result, share });
  });

  app.post("/api/puzzles/:key/reveal", (req, res) => {
    const p = puzzleFor(req.params.key);
    if (!p) return res.status(404).json({ error: "Puzzle not found" });
    const body = z.object({ clientId, entryId: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const placements = revealEntry(p, body.data.entryId);
    if (!placements) return res.status(404).json({ error: "Unknown clue" });
    const used = useReveal(db, body.data.clientId, p.key, MAX_REVEALS);
    if (used === null) return res.status(409).json({ error: `You can reveal up to ${MAX_REVEALS} words per puzzle` });
    res.json({ placements, revealsUsed: used });
  });

  app.get("/api/progress/:key", (req, res) => {
    const cid = clientId.safeParse(req.query.clientId);
    if (!cid.success) return res.status(400).json({ error: "clientId required" });
    const row = getProgress(db, cid.data, req.params.key);
    if (!row) return res.json({ state: null, reveals: 0, moves: 0, completed: false });
    res.json({ state: JSON.parse(row.state), reveals: row.reveals, moves: row.moves, completed: !!row.completed_at });
  });

  app.put("/api/progress/:key", (req, res) => {
    if (!puzzleFor(req.params.key)) return res.status(404).json({ error: "Puzzle not found" });
    const body = z.object({ clientId, state: z.unknown(), moves: z.number().int().min(0) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    saveProgress(db, body.data.clientId, req.params.key, body.data.state, body.data.moves);
    res.status(204).end();
  });

  app.get("/api/stats", (req, res) => {
    const cid = clientId.safeParse(req.query.clientId);
    if (!cid.success) return res.status(400).json({ error: "clientId required" });
    const t = typeof req.query.today === "string" && DATE_KEY.test(req.query.today) ? req.query.today : today();
    res.json(computeStreaks(completedKeys(db, cid.data), t));
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }
  return app;
}
