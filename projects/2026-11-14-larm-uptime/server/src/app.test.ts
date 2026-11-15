import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { runCheck } from "./engine.js";

let target: http.Server;
let url: string;
let healthy = true;

beforeAll(async () => {
  target = http.createServer((_q, res) => { res.statusCode = healthy ? 200 : 500; res.end("ok"); });
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
});
afterAll(() => target.close());

describe("API", () => {
  it("validates monitor input", async () => {
    const app = createApp(openDb(":memory:"));
    expect((await request(app).post("/api/monitors").send({ name: "x", type: "http", target: "ftp://nope" })).status).toBe(400);
    expect((await request(app).post("/api/monitors").send({ name: "x", type: "tcp", target: "h" })).status).toBe(400);
  });

  it("full lifecycle: down -> incident -> alert -> recovery -> status page", async () => {
    const db = openDb(":memory:");
    const send = vi.fn(async () => {});
    const app = createApp(db, { send });

    await request(app).post("/api/channels").send({ name: "slack", url: "https://hooks.example.com/x" }).expect(201);
    const created = await request(app).post("/api/monitors").send({ name: "Site", type: "http", target: url, failThreshold: 2 }).expect(201);
    const id = created.body.id;
    await request(app).post("/api/status-pages").send({ slug: "acme", title: "Acme", monitorIds: [id] }).expect(201);
    await request(app).post("/api/status-pages").send({ slug: "acme", title: "Dup" }).expect(409);

    await request(app).post(`/api/monitors/${id}/check`).expect(200);
    expect((await request(app).get("/api/public/status/acme")).body.overall).toBe("operational");

    healthy = false;
    await request(app).post(`/api/monitors/${id}/check`); // failure 1: still up, no alert
    expect(send).not.toHaveBeenCalled();
    await request(app).post(`/api/monitors/${id}/check`); // failure 2: down
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls[0])).toContain("DOWN");
    expect((await request(app).get("/api/public/status/acme")).body.overall).toBe("outage");
    expect((await request(app).get("/api/incidents")).body[0].resolvedAt).toBeNull();

    healthy = true;
    await request(app).post(`/api/monitors/${id}/check`);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await request(app).get("/api/incidents")).body[0].resolvedAt).not.toBeNull();

    const detail = await request(app).get(`/api/monitors/${id}?range=1h`).expect(200);
    expect(detail.body.stats.checks).toBe(4);
    expect(detail.body.stats.uptime).toBe(50);
    expect((await request(app).get("/api/public/status/missing")).status).toBe(404);
  });

  it("heartbeat monitors: ping recovers, missing ping fails", async () => {
    const db = openDb(":memory:");
    const app = createApp(db);
    const m = (await request(app).post("/api/monitors").send({ name: "cron", type: "heartbeat", intervalSec: 60, graceSec: 0, failThreshold: 1 })).body;
    expect(m.heartbeatPath).toMatch(/^\/api\/heartbeat\//);

    // Pretend the monitor was created long ago and never pinged.
    db.prepare("UPDATE monitors SET created_at = ? WHERE id = ?").run(Date.now() - 3_600_000, m.id);
    await runCheck(db, m.id);
    expect((db.prepare("SELECT status FROM monitors WHERE id=?").get(m.id) as { status: string }).status).toBe("down");

    await request(app).post(m.heartbeatPath).expect(200);
    expect((db.prepare("SELECT status FROM monitors WHERE id=?").get(m.id) as { status: string }).status).toBe("up");
    await request(app).get("/api/heartbeat/bogus").expect(404);
  });
});
