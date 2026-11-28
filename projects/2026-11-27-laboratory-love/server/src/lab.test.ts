import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { summarize } from "./store.js";

const DAY = 86_400_000;
let clock = new Date("2026-01-01T00:00:00Z");
const setup = () => {
  clock = new Date("2026-01-01T00:00:00Z");
  return createApp(openDb(":memory:"), { adminToken: "t", now: () => clock });
};
const admin = { "x-admin-token": "t" };
let app: ReturnType<typeof setup>;

async function fundedProduct(goal = 10_000) {
  const { body } = await request(app).post("/api/products").send({ name: "Yogurt", brand: "B", category: "Dairy" });
  await request(app).post(`/api/products/${body.id}/approve`).set(admin).send({ goal_cents: goal }).expect(200);
  return body.id as number;
}
const pledge = (id: number, cents: number) =>
  request(app).post(`/api/products/${id}/pledges`).send({ name: "Ada L", email: "a@x.io", amount_cents: cents });

beforeEach(() => {
  app = setup();
});

describe("lifecycle", () => {
  it("suggestions can't be pledged to until approved", async () => {
    const { body } = await request(app).post("/api/products").send({ name: "X", brand: "B", category: "C" });
    expect(body.status).toBe("suggested");
    await pledge(body.id, 500).expect(409);
  });

  it("approval requires the admin token", async () => {
    const { body } = await request(app).post("/api/products").send({ name: "X", brand: "B", category: "C" });
    await request(app).post(`/api/products/${body.id}/approve`).send({ goal_cents: 1000 }).expect(401);
  });

  it("tracks progress and moves to testing when the goal is reached", async () => {
    const id = await fundedProduct(10_000);
    let r = await pledge(id, 4000).expect(201);
    expect(r.body).toMatchObject({ raised_cents: 4000, percent: 40, status: "funding", backers: 1 });
    r = await pledge(id, 6000).expect(201);
    expect(r.body).toMatchObject({ percent: 100, status: "testing" });
    await pledge(id, 100).expect(409); // closed to funding once funded
  });

  it("rejects pledges under $1 and bad emails", async () => {
    const id = await fundedProduct();
    await pledge(id, 50).expect(400);
    await request(app).post(`/api/products/${id}/pledges`).send({ name: "A", email: "nope", amount_cents: 500 }).expect(400);
  });

  it("auto-refunds after 365 days without reaching the goal", async () => {
    const id = await fundedProduct(10_000);
    await pledge(id, 3000);
    clock = new Date(clock.getTime() + 366 * DAY);
    const { body } = await request(app).get(`/api/products/${id}`).expect(200);
    expect(body.status).toBe("expired");
    expect(body.raised_cents).toBe(0);
    expect(body.pledges[0].refunded).toBe(1);
    await pledge(id, 500).expect(409);
  });

  it("does not refund funded products", async () => {
    const id = await fundedProduct(1000);
    await pledge(id, 1000);
    clock = new Date(clock.getTime() + 400 * DAY);
    const { body } = await request(app).get(`/api/products/${id}`);
    expect(body.status).toBe("testing");
    expect(body.raised_cents).toBe(1000);
  });
});

describe("results", () => {
  const rows = (lots: string[]) =>
    lots.map((lot) => ({ lot, analyte: "DEHP", value_ng_g: lot === "A" ? 9 : null, loq_ng_g: 5 }));

  it("requires exactly three lots and a funded product", async () => {
    const id = await fundedProduct(1000);
    await request(app).post(`/api/products/${id}/results`).set(admin).send({ results: rows(["A", "B", "C"]) }).expect(409);
    await pledge(id, 1000);
    await request(app).post(`/api/products/${id}/results`).set(admin).send({ results: rows(["A", "B"]) }).expect(400);
    await request(app).post(`/api/products/${id}/results`).send({ results: rows(["A", "B", "C"]) }).expect(401);
    await request(app).post(`/api/products/${id}/results`).set(admin).send({ results: rows(["A", "B", "C"]) }).expect(201);
    const { body } = await request(app).get(`/api/products/${id}`);
    expect(body.status).toBe("complete");
    expect(body.results.summary[0]).toMatchObject({ analyte: "DEHP", lots_detected: 1, max_ng_g: 9 });
  });

  it("summarize treats values below LOQ as not detected", () => {
    const s = summarize([
      { lot: "A", analyte: "BPA", value_ng_g: 1, loq_ng_g: 2 },
      { lot: "B", analyte: "BPA", value_ng_g: null, loq_ng_g: 2 },
    ]);
    expect(s[0]).toMatchObject({ lots_detected: 0, max_ng_g: null });
  });
});

describe("listing", () => {
  it("filters by status and search", async () => {
    await fundedProduct();
    await request(app).post("/api/products").send({ name: "Soup", brand: "Deli", category: "Food" });
    expect((await request(app).get("/api/products?status=funding")).body).toHaveLength(1);
    expect((await request(app).get("/api/products?q=soup")).body).toHaveLength(1);
  });
});
