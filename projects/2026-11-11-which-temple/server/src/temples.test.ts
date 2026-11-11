import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb, type Db } from "./db.js";
import { seed } from "./seed.js";
import { facets, listTemples, randomTemple } from "./temples.js";

let db: Db;
beforeEach(() => { db = openDb(":memory:"); seed(db); });

describe("temples", () => {
  it("filters by tradition and state", () => {
    expect(listTemples(db, { tradition: "Jain" }).every((t) => t.tradition === "Jain")).toBe(true);
    const odisha = listTemples(db, { state: "Odisha" });
    expect(odisha.map((t) => t.city)).toContain("Puri");
  });
  it("searches free text", () => {
    const r = listTemples(db, { q: "Jyotirlinga" });
    expect(r.length).toBeGreaterThan(1);
  });
  it("random respects filter and rand injection", () => {
    const first = randomTemple(db, { state: "Odisha" }, () => 0)!;
    const last = randomTemple(db, { state: "Odisha" }, () => 0.999999)!;
    expect(first.state).toBe("Odisha");
    expect(last.state).toBe("Odisha");
    expect(first.id).not.toBe(last.id);
    expect(randomTemple(db, { state: "Nowhere" })).toBeUndefined();
  });
  it("facets list distinct values", () => {
    const f = facets(db);
    expect(f.traditions).toContain("Sikh");
    expect(new Set(f.states).size).toBe(f.states.length);
  });
});

describe("api", () => {
  it("GET /api/temples/random returns a temple, 404 when none", async () => {
    const app = createApp(db);
    const ok = await request(app).get("/api/temples/random");
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBeTruthy();
    expect((await request(app).get("/api/temples/random?state=Nowhere")).status).toBe(404);
  });
  it("GET /api/temples/:id", async () => {
    const app = createApp(db);
    expect((await request(app).get("/api/temples/1")).status).toBe(200);
    expect((await request(app).get("/api/temples/99999")).status).toBe(404);
    expect((await request(app).get("/api/temples/abc")).status).toBe(400);
  });
});
