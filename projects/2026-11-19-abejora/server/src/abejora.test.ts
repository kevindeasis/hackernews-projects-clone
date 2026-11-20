import { describe, it, expect } from "vitest";
import request from "supertest";
import { Store } from "./store.js";
import { createApp } from "./app.js";
import { buildReport } from "./report.js";

const setup = () => {
  const store = new Store(":memory:");
  return { store, api: request(createApp(store)) };
};

describe("history, undo and redo", () => {
  it("undoes and redoes create, edit and delete", async () => {
    const { api } = setup();
    const c = (await api.post("/api/clients").send({ name: "Acme" })).body;
    await api.patch(`/api/clients/${c.id}`).send({ name: "Acme Inc" });
    expect((await api.get("/api/clients")).body[0].name).toBe("Acme Inc");
    await api.post("/api/undo");
    expect((await api.get("/api/clients")).body[0].name).toBe("Acme");
    await api.post("/api/redo");
    expect((await api.get("/api/clients")).body[0].name).toBe("Acme Inc");
    await api.delete(`/api/clients/${c.id}`);
    expect((await api.get("/api/clients")).body).toHaveLength(0);
    await api.post("/api/undo");
    expect((await api.get("/api/clients")).body).toHaveLength(1);
    await api.post("/api/undo");
    await api.post("/api/undo");
    expect((await api.get("/api/clients")).body).toHaveLength(0);
    expect((await api.post("/api/undo")).status).toBe(409);
  });

  it("a new change discards the redo tail", async () => {
    const { api } = setup();
    await api.post("/api/clients").send({ name: "A" });
    await api.post("/api/undo");
    await api.post("/api/clients").send({ name: "B" });
    expect((await api.post("/api/redo")).status).toBe(409);
    expect((await api.get("/api/history")).body).toHaveLength(1);
  });
});

describe("timer", () => {
  it("starting a timer stops the previous one; stop closes it", async () => {
    const { api } = setup();
    const p = (await api.post("/api/projects").send({ name: "Site" })).body;
    const a = (await api.post("/api/timer/start").send({ project_id: p.id })).body;
    const b = (await api.post("/api/timer/start").send({ project_id: p.id, description: "x" })).body;
    const entries = (await api.get("/api/entries")).body;
    expect(entries.find((e: any) => e.id === a.id).ended_at).not.toBeNull();
    expect((await api.get("/api/timer")).body.id).toBe(b.id);
    await api.post("/api/timer/stop");
    expect((await api.get("/api/timer")).body).toBeNull();
    expect((await api.post("/api/timer/stop")).status).toBe(409);
  });

  it("undo of stop resumes the running timer", async () => {
    const { api } = setup();
    const p = (await api.post("/api/projects").send({ name: "Site" })).body;
    await api.post("/api/timer/start").send({ project_id: p.id });
    await api.post("/api/timer/stop");
    await api.post("/api/undo");
    expect((await api.get("/api/timer")).body).not.toBeNull();
  });
});

describe("reports", () => {
  const clients = [{ id: 1, name: "Acme", archived: 0 }];
  const projects = [{ id: 1, client_id: 1, name: "Site", rate_cents: 10000, color: "#fff" }];
  const entries = [
    { id: 1, project_id: 1, description: "", started_at: "2026-11-01T09:00:00Z", ended_at: "2026-11-01T11:00:00Z", billable: 1 },
    { id: 2, project_id: 1, description: "", started_at: "2026-11-02T09:00:00Z", ended_at: "2026-11-02T10:00:00Z", billable: 0 },
  ];
  it("sums seconds and values only billable time", () => {
    const [l] = buildReport(entries, projects, clients, "project");
    expect(l.seconds).toBe(3 * 3600);
    expect(l.billableSeconds).toBe(2 * 3600);
    expect(l.amountCents).toBe(20000);
  });
  it("groups by day and client", () => {
    expect(buildReport(entries, projects, clients, "day").map((l) => l.key)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(buildReport(entries, projects, clients, "client")[0].label).toBe("Acme");
  });
  it("validates input", async () => {
    const { api } = setup();
    expect((await api.post("/api/entries").send({ project_id: 99, started_at: "2026-11-01T09:00:00Z" })).status).toBe(400);
    expect((await api.post("/api/projects").send({ name: "" })).status).toBe(400);
  });
});
