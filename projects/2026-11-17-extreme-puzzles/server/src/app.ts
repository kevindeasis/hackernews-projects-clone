import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { BOOK_SIZE, KINDS, LEVELS, PuzzleRow, getOrCreate, publicView } from "./puzzles.js";
import { conflicts, humanSolve, isValidSolution } from "./core/sudoku.js";
import { killerWalkthrough } from "./core/killer.js";
import { matchSelection } from "./core/wordsearch.js";
import { randomBytes } from "node:crypto";

const kindSchema = z.enum(KINDS as [string, ...string[]]);
const levelSchema = z.enum(LEVELS as [string, ...string[]]);

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const load = (id: unknown): PuzzleRow | undefined =>
    db.prepare("SELECT * FROM puzzles WHERE id=?").get(Number(id)) as PuzzleRow | undefined;

  // A "book" is a fixed, seeded sequence of puzzles: page N always yields the same puzzle.
  app.get("/api/books/:kind/:difficulty", (req, res) => {
    const kind = kindSchema.safeParse(req.params.kind);
    const level = levelSchema.safeParse(req.params.difficulty);
    if (!kind.success || !level.success) return res.status(400).json({ error: "bad kind or difficulty" });
    const pages = Array.from({ length: BOOK_SIZE }, (_, i) => {
      const row = db
        .prepare("SELECT id FROM puzzles WHERE kind=? AND difficulty=? AND seed=?")
        .get(kind.data, level.data, `book-${i + 1}`) as { id: number } | undefined;
      const best = row
        ? (db.prepare("SELECT MIN(seconds) AS best FROM results WHERE puzzle_id=?").get(row.id) as { best: number | null }).best
        : null;
      return { page: i + 1, puzzleId: row?.id ?? null, bestSeconds: best };
    });
    res.json({ kind: kind.data, difficulty: level.data, pages });
  });

  const createBody = z.object({ kind: kindSchema, difficulty: levelSchema, page: z.number().int().min(1).max(BOOK_SIZE).optional() });
  app.post("/api/puzzles", (req, res) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const seed = body.data.page ? `book-${body.data.page}` : `rnd-${randomBytes(4).toString("hex")}`;
    const row = getOrCreate(db, body.data.kind as never, body.data.difficulty as never, seed);
    res.json(publicView(row));
  });

  app.get("/api/puzzles/:id", (req, res) => {
    const row = load(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(publicView(row));
  });

  // Sudoku / killer: validate a full or partial grid against the answer key.
  app.post("/api/puzzles/:id/check", (req, res) => {
    const row = load(req.params.id);
    if (!row || row.kind === "wordsearch") return res.status(404).json({ error: "not found" });
    const body = z.object({ grid: z.array(z.number().int().min(0).max(9)).length(81) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "grid must be 81 integers 0-9" });
    const solution = JSON.parse(row.solution) as number[];
    const grid = body.data.grid;
    const wrong = grid.map((v, i) => (v && v !== solution[i] ? i : -1)).filter((i) => i >= 0);
    const complete = grid.every((v) => v) && isValidSolution(grid) && wrong.length === 0;
    res.json({ complete, wrong, conflicts: conflicts(grid), filled: grid.filter(Boolean).length });
  });

  // Word search: does the dragged line spell a hidden word?
  app.post("/api/puzzles/:id/select", (req, res) => {
    const row = load(req.params.id);
    if (!row || row.kind !== "wordsearch") return res.status(404).json({ error: "not found" });
    const b = z.object({ r1: z.number().int(), c1: z.number().int(), r2: z.number().int(), c2: z.number().int() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "bad selection" });
    const data = JSON.parse(row.data);
    res.json({ word: matchSelection({ ...data, placements: [] }, b.data.r1, b.data.c1, b.data.r2, b.data.c2) });
  });

  // The online walkthrough: every deduction, in the order a person would make it.
  app.get("/api/puzzles/:id/walkthrough", (req, res) => {
    const row = load(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    const data = JSON.parse(row.data);
    const solution = JSON.parse(row.solution);
    if (row.kind === "wordsearch") return res.json({ kind: row.kind, placements: solution });
    const w = row.kind === "sudoku" ? humanSolve(data.givens, undefined, undefined, solution) : killerWalkthrough({ ...data, solution });
    res.json({ kind: row.kind, ...w, solution });
  });

  app.post("/api/puzzles/:id/results", (req, res) => {
    const row = load(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    const b = z.object({ seconds: z.number().int().min(1).max(86400), hints: z.number().int().min(0).default(0) }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "bad result" });
    db.prepare("INSERT INTO results (puzzle_id, seconds, hints) VALUES (?,?,?)").run(row.id, b.data.seconds, b.data.hints);
    res.json({ ok: true });
  });

  app.get("/api/stats", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.kind, p.difficulty, COUNT(*) AS solved, CAST(AVG(r.seconds) AS INTEGER) AS avgSeconds, MIN(r.seconds) AS bestSeconds
         FROM results r JOIN puzzles p ON p.id = r.puzzle_id GROUP BY p.kind, p.difficulty ORDER BY p.kind, p.difficulty`,
      )
      .all();
    res.json({ stats: rows });
  });

  return app;
}
