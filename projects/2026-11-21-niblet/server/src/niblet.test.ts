import { describe, expect, it } from "vitest";
import request from "supertest";
import { openDb, detectAllergen } from "./db.js";
import { createApp } from "./app.js";
import { allergenChecklist, foodStats, type EntryRow } from "./analysis.js";

const row = (o: Partial<EntryRow>): EntryRow => ({ id: 1, date: "2026-01-01", meal: "lunch", food: "banana", allergen: null, reaction: "none", notes: "", ...o });

describe("analysis", () => {
  it("flags foods with repeated or severe reactions", () => {
    const stats = foodStats([
      row({ food: "Banana" }), row({ food: "banana", date: "2026-01-03" }),
      row({ food: "yoghurt", allergen: "milk", reaction: "mild" }), row({ food: "Yoghurt", allergen: "milk", reaction: "mild", date: "2026-01-02" }),
      row({ food: "egg", allergen: "egg", reaction: "severe" }),
    ]);
    const by = Object.fromEntries(stats.map((s) => [s.food.toLowerCase(), s]));
    expect(by.banana.timesEaten).toBe(2);
    expect(by.banana.suspect).toBe(false);
    expect(by.yoghurt.suspect).toBe(true);
    expect(by.egg.suspect).toBe(true);
    expect(by.banana.lastTried).toBe("2026-01-03");
  });
  it("builds an allergen checklist", () => {
    const c = allergenChecklist([row({ food: "egg", allergen: "egg", date: "2026-02-01" })]);
    expect(c.find((a) => a.allergen === "egg")).toMatchObject({ introduced: true, firstTried: "2026-02-01" });
    expect(c.find((a) => a.allergen === "peanut")?.introduced).toBe(false);
  });
  it("detects allergens from food names", () => {
    expect(detectAllergen("Scrambled egg")).toBe("egg");
    expect(detectAllergen("peanut butter")).toBe("peanut");
    expect(detectAllergen("carrot")).toBeNull();
  });
});

describe("api", () => {
  const app = () => createApp(openDb(":memory:"));
  it("logs entries, updates reactions, and reports", async () => {
    const a = app();
    const created = await request(a).post("/api/entries").send({ date: "2026-03-01", meal: "lunch", food: "Peanut butter" });
    expect(created.status).toBe(201);
    expect(created.body.allergen).toBe("peanut");
    await request(a).patch(`/api/entries/${created.body.id}`).send({ reaction: "mild", notes: "red cheeks" }).expect(200);
    const rep = await request(a).get("/api/report");
    expect(rep.text).toContain("Peanut butter -> mild (red cheeks)");
    expect(rep.text).toContain("peanut: first 2026-03-01");
    const al = await request(a).get("/api/allergens");
    expect(al.body.find((x: { allergen: string }) => x.allergen === "peanut").reactions).toBe(1);
  });
  it("validates input and handles missing ids", async () => {
    const a = app();
    await request(a).post("/api/entries").send({ date: "bad", meal: "lunch", food: "x" }).expect(400);
    await request(a).delete("/api/entries/99").expect(404);
  });
  it("stores baby name", async () => {
    const a = app();
    await request(a).put("/api/settings").send({ babyName: "Ava" }).expect(200);
    expect((await request(a).get("/api/settings")).body.babyName).toBe("Ava");
  });
});
