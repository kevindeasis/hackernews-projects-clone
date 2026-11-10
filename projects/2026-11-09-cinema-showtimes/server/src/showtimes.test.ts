import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { openDb } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { listAreas, searchShowtimes } from "./showtimes.js";

const db = openDb(":memory:");
beforeAll(() => seed(db, "2026-11-10"));

describe("searchShowtimes", () => {
  it("returns everything for 7 days x 6 cinemas x 5 slots", () => {
    expect(searchShowtimes(db, {})).toHaveLength(7 * 6 * 5);
  });
  it("filters by area and date", () => {
    const rows = searchShowtimes(db, { area: "Shibuya", date: "2026-11-11" });
    expect(rows).toHaveLength(2 * 5);
    expect(rows.every((r) => r.area === "Shibuya" && r.startsAt.startsWith("2026-11-11"))).toBe(true);
  });
  it("filters by earliest time and format", () => {
    const rows = searchShowtimes(db, { after: "18:00", format: "IMAX" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.startsAt.slice(11) >= "18:00" && r.format === "IMAX")).toBe(true);
  });
  it("lists areas", () => {
    expect(listAreas(db)).toEqual(["Roppongi", "Shibuya", "Shinjuku"]);
  });
});

describe("API", () => {
  const app = createApp(db);
  it("serves showtimes", async () => {
    const res = await request(app).get("/api/showtimes?area=Roppongi&date=2026-11-10");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });
  it("rejects bad input", async () => {
    const res = await request(app).get("/api/showtimes?date=nope");
    expect(res.status).toBe(400);
  });
});
