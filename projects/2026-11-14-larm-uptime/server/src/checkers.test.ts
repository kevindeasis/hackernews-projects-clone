import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkDns, checkHttp, checkTcp } from "./checkers.js";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/slow") return; // never responds
    if (req.url === "/teapot") { res.statusCode = 418; return res.end("short and stout"); }
    res.end("hello larm");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("checkHttp", () => {
  it("passes on 200 and reports a phase trace", async () => {
    const r = await checkHttp({ url: base, timeoutMs: 2000 });
    expect(r.ok).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.latencyMs).toBeGreaterThan(0);
    expect(r.ttfbMs).not.toBeNull();
    expect(r.tcpMs).not.toBeNull();
  });
  it("fails on unexpected status", async () => {
    const r = await checkHttp({ url: `${base}/teapot`, timeoutMs: 2000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("418");
  });
  it("accepts an explicitly expected status", async () => {
    expect((await checkHttp({ url: `${base}/teapot`, timeoutMs: 2000, expectedStatus: 418 })).ok).toBe(true);
  });
  it("checks keywords in the body", async () => {
    expect((await checkHttp({ url: base, timeoutMs: 2000, keyword: "larm" })).ok).toBe(true);
    const miss = await checkHttp({ url: base, timeoutMs: 2000, keyword: "nope" });
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain("nope");
  });
  it("times out", async () => {
    const r = await checkHttp({ url: `${base}/slow`, timeoutMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Timed out/);
  });
  it("rejects bad URLs and connection refusals", async () => {
    expect((await checkHttp({ url: "nonsense", timeoutMs: 500 })).error).toBe("Invalid URL");
    expect((await checkHttp({ url: "http://127.0.0.1:1", timeoutMs: 1000 })).ok).toBe(false);
  });
});

describe("checkTcp", () => {
  it("connects to an open port and fails on a closed one", async () => {
    const srv = net.createServer((s) => s.end());
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as AddressInfo).port;
    expect((await checkTcp("127.0.0.1", port, 1000)).ok).toBe(true);
    srv.close();
    expect((await checkTcp("127.0.0.1", port, 1000)).ok).toBe(false);
  });
});

describe("checkDns", () => {
  it("fails for an unresolvable name", async () => {
    const r = await checkDns("definitely-not-a-real-host.invalid", "A", 3000);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
