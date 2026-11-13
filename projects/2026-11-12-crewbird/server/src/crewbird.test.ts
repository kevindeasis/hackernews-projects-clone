import { describe, expect, it } from "vitest";
import request from "supertest";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { canTransition, overlaps, summarize } from "./logic.js";

describe("logic", () => {
  it("allows only forward transitions", () => {
    expect(canTransition("lead", "scheduled")).toBe(true);
    expect(canTransition("lead", "paid")).toBe(false);
    expect(canTransition("paid", "lead")).toBe(false);
  });
  it("detects overlapping slots for same technician", () => {
    const a = { technician_id: 1, scheduled_date: "2026-01-01", scheduled_time: "09:00", duration_min: 60 };
    expect(overlaps(a, { ...a, scheduled_time: "09:30" })).toBe(true);
    expect(overlaps(a, { ...a, scheduled_time: "10:00" })).toBe(false);
    expect(overlaps(a, { ...a, technician_id: 2 })).toBe(false);
  });
  it("summarizes revenue", () => {
    const s = summarize([
      { status: "paid", price_cents: 100 },
      { status: "invoiced", price_cents: 50 },
      { status: "lead", price_cents: 0 },
    ]);
    expect(s.paidCents).toBe(100);
    expect(s.unpaidCents).toBe(50);
    expect(s.counts.lead).toBe(1);
  });
});

describe("api", () => {
  const mk = () => createApp(openDb(":memory:"));

  it("turns a lead form submission into a customer and lead job, reusing customers", async () => {
    const app = mk();
    const r = await request(app).post("/api/leads").send({ name: "Ann", email: "a@x.com", request: "Clogged drain" });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("lead");
    await request(app).post("/api/leads").send({ name: "Ann", email: "a@x.com", request: "Another" });
    expect((await request(app).get("/api/customers")).body).toHaveLength(1);
  });

  it("rejects double-booking a technician and walks a job through its lifecycle", async () => {
    const app = mk();
    const cust = (await request(app).post("/api/customers").send({ name: "C" })).body;
    const tech = (await request(app).post("/api/technicians").send({ name: "T" })).body;
    const body = { customer_id: cust.id, technician_id: tech.id, title: "A", scheduled_date: "2026-05-01", scheduled_time: "09:00", duration_min: 60, price_cents: 5000 };
    const j = await request(app).post("/api/jobs").send(body);
    expect(j.body.status).toBe("scheduled");
    expect((await request(app).post("/api/jobs").send({ ...body, scheduled_time: "09:30" })).status).toBe(409);
    for (const s of ["in_progress", "done", "invoiced", "paid"])
      expect((await request(app).post(`/api/jobs/${j.body.id}/status`).send({ status: s })).status).toBe(200);
    expect((await request(app).get("/api/summary")).body.paidCents).toBe(5000);
    expect((await request(app).post(`/api/jobs/${j.body.id}/status`).send({ status: "lead" })).status).toBe(400);
  });
});
