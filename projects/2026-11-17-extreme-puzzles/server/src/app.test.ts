import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const app = createApp(openDb(":memory:"));

describe("api", () => {
  it("creates a book page deterministically and hides the solution", async () => {
    const a = await request(app).post("/api/puzzles").send({ kind: "sudoku", difficulty: "easy", page: 1 });
    const b = await request(app).post("/api/puzzles").send({ kind: "sudoku", difficulty: "easy", page: 1 });
    expect(a.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.solution).toBeUndefined();
    const books = await request(app).get("/api/books/sudoku/easy");
    expect(books.body.pages[0].puzzleId).toBe(a.body.id);
  });

  it("checks grids and serves a walkthrough that ends solved", async () => {
    const p = (await request(app).post("/api/puzzles").send({ kind: "sudoku", difficulty: "easy", page: 2 })).body;
    const w = (await request(app).get(`/api/puzzles/${p.id}/walkthrough`)).body;
    expect(w.solved).toBe(true);
    const ok = await request(app).post(`/api/puzzles/${p.id}/check`).send({ grid: w.solution });
    expect(ok.body.complete).toBe(true);
    const bad = w.solution.slice();
    bad[0] = bad[0] === 9 ? 1 : bad[0] + 1;
    const res = await request(app).post(`/api/puzzles/${p.id}/check`).send({ grid: bad });
    expect(res.body.complete).toBe(false);
    expect(res.body.wrong).toContain(0);
  });

  it("records results and reports stats", async () => {
    const p = (await request(app).post("/api/puzzles").send({ kind: "wordsearch", difficulty: "easy", page: 1 })).body;
    await request(app).post(`/api/puzzles/${p.id}/results`).send({ seconds: 42 }).expect(200);
    const s = await request(app).get("/api/stats");
    expect(s.body.stats[0]).toMatchObject({ kind: "wordsearch", solved: 1, bestSeconds: 42 });
  });

  it("rejects bad input", async () => {
    await request(app).post("/api/puzzles").send({ kind: "chess", difficulty: "easy" }).expect(400);
  });
});
