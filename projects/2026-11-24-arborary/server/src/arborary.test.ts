import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { bboxAreaM2, densityGrid, parseBbox } from "./geo.js";

function setup() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO cities (slug,name,lat,lng) VALUES ('t','Test',37.76,-122.41)").run();
  return { db, app: createApp(db) };
}
const csv = "lat,lng,species,canopy_m,confidence\n37.76,-122.41,Oak,6,0.4\n37.761,-122.411,Pine,4,0.9\nbad,x,,,\n";

describe("geo", () => {
  it("computes bbox area close to a known value", () => {
    // 0.01deg x 0.01deg at ~37.76N is roughly 0.88km x 1.11km
    const a = bboxAreaM2({ south: 37.755, west: -122.415, north: 37.765, east: -122.405 });
    expect(a / 1e6).toBeGreaterThan(0.95);
    expect(a / 1e6).toBeLessThan(1.05);
  });
  it("parses and rejects bboxes", () => {
    expect(parseBbox("1,2,3,4")).toEqual({ south: 1, west: 2, north: 3, east: 4 });
    expect(parseBbox("3,2,1,4")).toBeNull();
    expect(parseBbox("a,b")).toBeNull();
  });
  it("bins trees into grid cells", () => {
    const b = { south: 0, west: 0, north: 1, east: 1 };
    const g = densityGrid([{ lat: 0.1, lng: 0.1, canopy_m: 4 }, { lat: 0.12, lng: 0.11, canopy_m: 4 }, { lat: 0.9, lng: 0.9, canopy_m: 4 }], b, 2);
    expect(g.find((c) => c.row === 0 && c.col === 0)!.count).toBe(2);
    expect(g.find((c) => c.row === 1 && c.col === 1)!.count).toBe(1);
  });
});

describe("api", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it("imports CSV, skipping bad rows", async () => {
    const r = await request(ctx.app).post("/api/cities/t/import").set("Content-Type", "text/csv").send(csv);
    expect(r.body).toMatchObject({ imported: 2, skipped: 1 });
    const trees = await request(ctx.app).get("/api/cities/t/trees");
    expect(trees.body).toHaveLength(2);
  });

  it("serves a review queue ordered by confidence and updates status", async () => {
    await request(ctx.app).post("/api/cities/t/import").set("Content-Type", "text/csv").send(csv);
    const next = await request(ctx.app).get("/api/cities/t/review/next");
    expect(next.body.species).toBe("Oak");
    const p = await request(ctx.app).patch(`/api/trees/${next.body.id}`).send({ status: "rejected" });
    expect(p.body.status).toBe("rejected");
    const next2 = await request(ctx.app).get("/api/cities/t/review/next");
    expect(next2.body.species).toBe("Pine");
    // rejected trees are hidden by default
    expect((await request(ctx.app).get("/api/cities/t/trees")).body).toHaveLength(1);
  });

  it("adds manual trees and computes stats", async () => {
    await request(ctx.app).post("/api/cities/t/trees").send({ lat: 37.76, lng: -122.41, species: "Oak", canopy_m: 10 }).expect(201);
    const s = await request(ctx.app).get("/api/cities/t/stats?bbox=37.755,-122.415,37.765,-122.405");
    expect(s.body.total).toBe(1);
    expect(s.body.canopyCover).toBeGreaterThan(0);
    expect(s.body.topSpecies[0]).toEqual({ species: "Oak", count: 1 });
  });

  it("validates input", async () => {
    await request(ctx.app).patch("/api/trees/1").send({}).expect(400);
    await request(ctx.app).get("/api/cities/t/trees?bbox=oops").expect(400);
    await request(ctx.app).get("/api/cities/nope").expect(404);
    await request(ctx.app).get("/api/cities/t/review/next").expect(404);
  });
});
