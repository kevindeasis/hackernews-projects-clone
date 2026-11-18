import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { buildPanel, parseJudgeJson, heuristicJudge, DEFAULT_CRITERIA } from "./judges.js";
import { aggregate, judgeRanks } from "./ranking.js";
import { Store, slugify } from "./store.js";

describe("ranking", () => {
  it("ranks per judge with shared ties", () => {
    const r = judgeRanks([
      { productId: 1, judgeId: "a", overall: 8 },
      { productId: 2, judgeId: "a", overall: 8 },
      { productId: 3, judgeId: "a", overall: 5 },
    ]);
    expect([r.get(1), r.get(2), r.get(3)]).toEqual([1, 1, 3]);
  });
  it("uses Borda count over raw means", () => {
    // p1 is loved by 2 judges and hated by 1 outlier; p2 is mediocre everywhere
    const res = [
      ...[["a", 9, 6], ["b", 9, 6], ["c", 0, 6.5]].flatMap(([j, a, b]) => [
        { productId: 1, judgeId: j as string, overall: a as number },
        { productId: 2, judgeId: j as string, overall: b as number },
      ]),
    ];
    const out = aggregate(res);
    expect(out[0].productId).toBe(1);
    expect(out[0].borda).toBe(2);
    expect(out[1].mean).toBeGreaterThan(out[0].mean);
  });
});

describe("judges", () => {
  const p = { name: "Foo", url: "https://foo.dev", tagline: "Track your habits daily", description: "Foo helps you track habits and export data via API. Simple." };
  it("is deterministic and bounded", async () => {
    const j = heuristicJudge({ id: "x", name: "X", persona: "", bias: {} });
    const a = await j.evaluate(p, DEFAULT_CRITERIA);
    const b = await j.evaluate(p, DEFAULT_CRITERIA);
    expect(a).toEqual(b);
    for (const v of Object.values(a.scores)) expect(v >= 0 && v <= 10).toBe(true);
  });
  it("has a panel of 10 judges that disagree", async () => {
    const panel = buildPanel();
    expect(panel).toHaveLength(10);
    const overalls = new Set((await Promise.all(panel.map((j) => j.evaluate(p, DEFAULT_CRITERIA)))).map((e) => e.overall));
    expect(overalls.size).toBeGreaterThan(3);
  });
  it("parses LLM JSON and rejects bad output", () => {
    expect(parseJudgeJson('ok {"scores":{"A":7,"B":11},"rationale":"r"}', ["A", "B"])?.scores).toEqual({ A: 7, B: 10 });
    expect(parseJudgeJson("nope", ["A"])).toBeNull();
    expect(parseJudgeJson('{"scores":{}}', ["A"])).toBeNull();
  });
});

describe("api", () => {
  const make = () => createApp(new Store(":memory:"), buildPanel());
  it("slugifies", () => expect(slugify("Best  Side-Project 2026!")).toBe("best-side-project-2026"));
  it("runs a competition end to end", async () => {
    const app = make();
    const c = (await request(app).post("/api/competitions").send({ title: "Weekend Hack" })).body;
    expect(c.slug).toBe("weekend-hack");
    expect((await request(app).post("/api/competitions").send({ title: "Weekend Hack" })).body.slug).toBe("weekend-hack-2");
    const good = { name: "Good", url: "https://good.dev", tagline: "Track and automate invoices", description: "Good helps freelancers track invoices, automate reminders, export reports and import bank data through an API. It saves hours every week." };
    const weak = { name: "Weak", url: "", tagline: "", description: "an all-in-one AI-powered platform dashboard solution" };
    await request(app).post("/api/competitions/weekend-hack/products").send(good).expect(201);
    await request(app).post("/api/competitions/weekend-hack/products").send(weak).expect(201);
    const board = (await request(app).get("/api/competitions/weekend-hack")).body.leaderboard;
    expect(board).toHaveLength(2);
    expect(board[0].product.name).toBe("Good");
    expect(board[0].evaluations).toHaveLength(10);
    expect(board[0].rank).toBe(1);
  });
  it("validates input and 404s", async () => {
    const app = make();
    await request(app).post("/api/competitions").send({ title: "" }).expect(400);
    await request(app).get("/api/competitions/nope").expect(404);
    await request(app).post("/api/competitions/nope/products").send({ name: "x" }).expect(404);
  });
});
