import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, MAX_REVEALS } from "./app.js";
import { openDb, computeStreaks } from "./db.js";
import { buildPuzzle, checkArrangement, rotate, SIZE, type SlotState } from "./puzzle.js";

const KEYS = ["2026-11-22", "2026-11-23", "2026-01-01", "practice-abc123", "2025-05-05"];

describe("crossword generation", () => {
  it("is deterministic per key", () => {
    expect(buildPuzzle("2026-11-22").solution).toEqual(buildPuzzle("2026-11-22").solution);
    expect(buildPuzzle("2026-11-22").solution).not.toEqual(buildPuzzle("2026-11-23").solution);
  });

  it.each(KEYS)("%s: every run of letters is a clued entry (no accidental words)", (key) => {
    const p = buildPuzzle(key);
    expect(p.entries.length).toBeGreaterThanOrEqual(6);
    expect(p.entries.every((e) => e.clue !== "(no clue)")).toBe(true);
    // number of runs >=2 in the grid equals number of entries
    let runs = 0;
    const g = p.solution;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (!g[r][c]) continue;
      if ((c === 0 || !g[r][c - 1]) && c + 1 < SIZE && g[r][c + 1]) runs++;
      if ((r === 0 || !g[r - 1][c]) && r + 1 < SIZE && g[r + 1][c]) runs++;
    }
    expect(runs).toBe(p.entries.length);
  });
});

describe("tiles", () => {
  it("rotation by 4 quarter-turns is the identity", () => {
    const m = [["A", "B", "C"], ["D", "E", "F"], ["G", "H", "I"]];
    expect(rotate(m, 4)).toEqual(m);
    expect(rotate(m, 1)[0]).toEqual(["G", "D", "A"]);
  });

  it("the scrambled puzzle is not solved, but the known solution arrangement is", () => {
    const p = buildPuzzle("2026-11-22");
    const naive: SlotState[] = p.tiles.map((t) => ({ tile: t.id, rot: 0 }));
    expect(checkArrangement(p, naive).solved).toBe(false);
    const solved: SlotState[] = p.tiles.map((t) => ({ tile: t.id, rot: p.correctRot[t.id] }));
    const res = checkArrangement(p, solved);
    expect(res.solved).toBe(true);
    expect(res.correctEntries.length).toBe(p.entries.length);
  });
});

describe("streaks", () => {
  it("counts consecutive days, surviving an unsolved today", () => {
    expect(computeStreaks(["2026-11-20", "2026-11-21"], "2026-11-22").current).toBe(2);
    expect(computeStreaks(["2026-11-19", "2026-11-21"], "2026-11-22").current).toBe(1);
    expect(computeStreaks(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-10"], "2026-11-22")).toMatchObject({ current: 0, best: 3 });
  });
});

describe("API", () => {
  const app = () => createApp(openDb(":memory:"));

  it("never leaks the solution", async () => {
    const res = await request(app()).get("/api/puzzles/2026-11-22");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("answer");
    expect(res.body.solution).toBeUndefined();
    expect(res.body.tiles).toHaveLength(9);
  });

  it("rejects bad keys and far-future dates", async () => {
    const a = app();
    expect((await request(a).get("/api/puzzles/nope")).status).toBe(404);
    expect((await request(a).get("/api/puzzles/2999-01-01")).status).toBe(404);
  });

  it("limits reveals and records completion with a share text", async () => {
    const a = app();
    const key = "2026-11-22";
    const p = buildPuzzle(key);
    for (let i = 0; i < MAX_REVEALS; i++) {
      const r = await request(a).post(`/api/puzzles/${key}/reveal`).send({ clientId: "client-1", entryId: p.entries[i].id });
      expect(r.status).toBe(200);
      expect(r.body.revealsUsed).toBe(i + 1);
    }
    expect((await request(a).post(`/api/puzzles/${key}/reveal`).send({ clientId: "client-1", entryId: p.entries[0].id })).status).toBe(409);

    const slots = p.tiles.map((t) => ({ tile: t.id, rot: p.correctRot[t.id] }));
    const res = await request(a).post(`/api/puzzles/${key}/check`).send({ clientId: "client-1", slots, moves: 12 });
    expect(res.body.solved).toBe(true);
    expect(res.body.share).toContain("12 moves");
    const stats = await request(a).get("/api/stats").query({ clientId: "client-1", today: key });
    expect(stats.body).toMatchObject({ current: 1, played: 1 });
  });

  it("archive lists past days newest first", async () => {
    const res = await request(app()).get("/api/archive").query({ today: "2026-11-22", clientId: "client-9" });
    expect(res.body.items[0].key).toBe("2026-11-22");
    expect(res.body.items[1].key).toBe("2026-11-21");
  });
});
