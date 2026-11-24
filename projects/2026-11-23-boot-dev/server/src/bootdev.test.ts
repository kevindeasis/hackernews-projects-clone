import { describe, it, expect } from "vitest";
import request from "supertest";
import { judge } from "./judge.js";
import { getLesson, lessons } from "./lessons.js";
import { levelForXp, streak } from "./xp.js";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

describe("judge", () => {
  it("passes correct JS and fails wrong JS", () => {
    const l = getLesson("js-1")!;
    expect(judge(l, "function add(a,b){return a+b}").passed).toBe(true);
    expect(judge(l, "function add(a,b){return a-b}").passed).toBe(false);
    expect(judge(l, "syntax error here").passed).toBe(false);
  });
  it("times out infinite loops", () => {
    expect(judge(getLesson("js-1")!, "function add(){while(true){}}").passed).toBe(false);
  });
  it("grades SQL, ignoring row order unless required", () => {
    expect(judge(getLesson("sql-2")!, "SELECT name FROM customers WHERE country='UK' ORDER BY name DESC").passed).toBe(true);
    expect(judge(getLesson("sql-2")!, "SELECT name FROM customers").passed).toBe(false);
    const g = getLesson("sql-4")!;
    expect(judge(g, g.expectedQuery!).passed).toBe(true);
    expect(judge(g, g.expectedQuery!.replace("DESC", "ASC")).passed).toBe(false);
    expect(judge(getLesson("sql-1")!, "DELETE FROM customers").passed).toBe(false);
  });
});

describe("xp", () => {
  it("computes levels", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(299).level).toBe(2);
    expect(levelForXp(300).level).toBe(3);
  });
  it("computes streaks", () => {
    expect(streak(["2026-11-21", "2026-11-22", "2026-11-23"], "2026-11-23")).toBe(3);
    expect(streak(["2026-11-21", "2026-11-22"], "2026-11-23")).toBe(2);
    expect(streak(["2026-11-20"], "2026-11-23")).toBe(0);
  });
});

describe("api", () => {
  it("awards XP once per lesson", async () => {
    const app = createApp(openDb(":memory:"), () => "2026-11-23");
    await request(app).post("/api/login").send({ name: "kev" }).expect(200);
    const run = () => request(app).post("/api/lessons/js-1/run").set("x-user", "kev").send({ code: "function add(a,b){return a+b}" });
    expect((await run()).body.awarded).toBe(10);
    const second = await run();
    expect(second.body.awarded).toBe(0);
    expect(second.body.me.xp).toBe(10);
    const lb = await request(app).get("/api/leaderboard");
    expect(lb.body[0]).toMatchObject({ name: "kev", xp: 10 });
  });
  it("every lesson's reference is internally consistent", () => {
    for (const l of lessons) expect(l.starter.length).toBeGreaterThan(0);
    expect(lessons.filter((l) => l.kind === "sql").every((l) => l.expectedQuery)).toBe(true);
  });
});
