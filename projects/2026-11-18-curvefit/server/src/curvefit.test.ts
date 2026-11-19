import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { fitCurve, frontier, predictMaxReps, predictWeight, prescribe, type SetPoint } from "./curve.js";
import { Store } from "./store.js";

const NOW = new Date("2026-11-18");
const synth = (e1rm: number, k: number, reps: number[]): SetPoint[] =>
  reps.map((r) => ({ weight: Math.round((e1rm / (1 + r / k)) * 10) / 10, reps: r, date: "2026-11-17" }));

describe("curve fitting", () => {
  it("recovers e1RM and k from noiseless data", () => {
    const fit = fitCurve(synth(120, 36, [3, 5, 8, 12, 15]), NOW)!;
    expect(fit.e1rm).toBeGreaterThan(117);
    expect(fit.e1rm).toBeLessThan(123);
    expect(Math.abs(fit.k - 36)).toBeLessThanOrEqual(3);
  });

  it("falls back to Epley (k=30) with a single set", () => {
    const fit = fitCurve([{ weight: 100, reps: 5, date: "2026-11-17" }], NOW)!;
    expect(fit.k).toBe(30);
    expect(fit.e1rm).toBeCloseTo(100 * (1 + 5 / 30), 0);
  });

  it("returns null with no usable sets", () => {
    expect(fitCurve([], NOW)).toBeNull();
  });

  it("keeps only frontier sets", () => {
    const sets = [
      { weight: 100, reps: 5 },
      { weight: 90, reps: 5 }, // dominated
      { weight: 80, reps: 10 },
    ];
    expect(frontier(sets)).toHaveLength(2);
  });

  it("counts RPE as reps in reserve", () => {
    const easy = fitCurve([{ weight: 100, reps: 5, rpe: 7, date: "2026-11-17" }], NOW)!;
    const hard = fitCurve([{ weight: 100, reps: 5, rpe: 10, date: "2026-11-17" }], NOW)!;
    expect(easy.e1rm).toBeGreaterThan(hard.e1rm);
  });

  it("weights recent sets more than old ones", () => {
    const old = { weight: 140, reps: 3, date: "2026-01-01" };
    const recent = { weight: 100, reps: 3, date: "2026-11-17" };
    const fit = fitCurve([old, recent], NOW)!;
    expect(fit.e1rm).toBeLessThan((140 + 100) / 2 * 1.1);
  });
});

describe("prescription", () => {
  const fit = { e1rm: 120, k: 30, points: 3 };
  it("prescribes heavier weights for fewer reps, rounded to the plate increment", () => {
    const [heavy, medium, light] = prescribe(fit, { increment: 2.5, rir: 1 });
    expect(heavy.weight).toBeGreaterThan(medium.weight);
    expect(medium.weight).toBeGreaterThan(light.weight);
    for (const p of [heavy, medium, light]) expect(p.weight % 2.5).toBe(0);
  });
  it("round-trips weight and reps", () => {
    expect(predictMaxReps(fit, predictWeight(fit, 8))).toBeCloseTo(8, 6);
  });
  it("never recommends more than the curve allows", () => {
    for (const p of prescribe(fit, { increment: 2.5, rir: 0 })) expect(predictMaxReps(fit, p.weight)).toBeGreaterThanOrEqual(p.reps - 1e-6);
  });
});

describe("API", () => {
  const app = createApp(new Store(":memory:"));

  it("logs sets and returns a fitted curve + prescription", async () => {
    const ex = await request(app).post("/api/exercises").send({ name: "Squat" }).expect(201);
    expect((await request(app).post("/api/exercises").send({ name: "squat" })).status).toBe(409);
    const id = ex.body.id;
    for (const [weight, reps] of [[100, 5], [80, 10], [70, 15]])
      await request(app).post(`/api/exercises/${id}/sets`).send({ weight, reps }).expect(201);
    const detail = await request(app).get(`/api/exercises/${id}`).expect(200);
    expect(detail.body.fit.e1rm).toBeGreaterThan(100);
    expect(detail.body.prescription).toHaveLength(3);
    expect(detail.body.curve).toHaveLength(20);
    expect(detail.body.sets.every((s: { onFrontier: boolean }) => s.onFrontier)).toBe(true);
  });

  it("validates input", async () => {
    await request(app).post("/api/exercises/1/sets").send({ weight: -5, reps: 3 }).expect(400);
  });

  it("persists settings and uses them in prescriptions", async () => {
    await request(app).put("/api/settings").send({ unit: "lb", increment: 5 }).expect(200);
    const plan = await request(app).get("/api/plan").expect(200);
    expect(plan.body.settings.unit).toBe("lb");
    for (const p of plan.body.exercises[0].prescription) expect(p.weight % 5).toBe(0);
  });

  it("deletes sets and exercises", async () => {
    await request(app).delete("/api/exercises/1").expect(204);
    await request(app).get("/api/exercises/1").expect(404);
  });
});
