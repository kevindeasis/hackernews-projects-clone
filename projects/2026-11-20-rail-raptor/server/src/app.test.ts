import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadNetwork, openDb } from "./db.js";

const app = createApp(loadNetwork(openDb()));

describe("api", () => {
  it("lists stations", async () => {
    const r = await request(app).get("/api/stations");
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(15);
  });

  it("routes London to Newcastle via the East Coast line", async () => {
    const r = await request(app).get("/api/journeys").query({ from: "KGX", to: "NCL", depart: "09:00" });
    expect(r.status).toBe(200);
    const j = r.body.journeys[0];
    expect(j.changes).toBe(0);
    expect(j.depLabel).toBe("09:00");
    expect(j.duration).toBe(190);
  });

  it("finds a cross-network journey that needs a change (Cardiff to Leeds)", async () => {
    const r = await request(app).get("/api/journeys").query({ from: "CDF", to: "LDS", depart: "08:00" });
    expect(r.body.journeys.length).toBeGreaterThan(0);
    expect(r.body.journeys[0].changes).toBeGreaterThanOrEqual(1);
  });

  it("walks between London termini", async () => {
    const r = await request(app).get("/api/journeys").query({ from: "EUS", to: "NCL", depart: "09:00" });
    const legs = r.body.journeys[0].legs;
    expect(legs.some((l: { mode: string }) => l.mode === "walk")).toBe(true);
  });

  it("validates input", async () => {
    expect((await request(app).get("/api/journeys").query({ from: "KGX" })).status).toBe(400);
    expect((await request(app).get("/api/journeys").query({ from: "KGX", to: "KGX" })).status).toBe(400);
    expect((await request(app).get("/api/journeys").query({ from: "KGX", to: "ZZZ" })).status).toBe(404);
    expect((await request(app).get("/api/journeys").query({ from: "KGX", to: "NCL", depart: "99:99" })).status).toBe(400);
  });
});
