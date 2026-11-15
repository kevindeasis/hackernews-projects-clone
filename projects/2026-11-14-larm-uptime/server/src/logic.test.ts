import { describe, expect, it } from "vitest";
import { applyResult, heartbeatOverdue, overallStatus, percentile, uptimePct } from "./logic.js";

describe("applyResult", () => {
  it("stays up until the failure threshold is reached", () => {
    let s = { status: "up" as const, consecutiveFailures: 0 };
    const t1 = applyResult(s, false, 3);
    expect(t1).toMatchObject({ status: "up", consecutiveFailures: 1, incident: null });
    const t2 = applyResult({ status: "up", consecutiveFailures: 2 }, false, 3);
    expect(t2).toMatchObject({ status: "down", incident: "opened" });
  });
  it("does not reopen an incident while down, and resolves on success", () => {
    expect(applyResult({ status: "down", consecutiveFailures: 5 }, false, 2).incident).toBeNull();
    expect(applyResult({ status: "down", consecutiveFailures: 5 }, true, 2)).toEqual({ status: "up", consecutiveFailures: 0, incident: "resolved" });
  });
  it("a success resets the failure counter without an incident event", () => {
    expect(applyResult({ status: "up", consecutiveFailures: 1 }, true, 2)).toEqual({ status: "up", consecutiveFailures: 0, incident: null });
  });
  it("first check of a pending monitor can go straight to down with threshold 1", () => {
    expect(applyResult({ status: "pending", consecutiveFailures: 0 }, false, 1).incident).toBe("opened");
  });
});

describe("stats", () => {
  it("computes interpolated percentiles", () => {
    const v = [10, 20, 30, 40, 50];
    expect(percentile(v, 50)).toBe(30);
    expect(percentile(v, 0)).toBe(10);
    expect(percentile(v, 100)).toBe(50);
    expect(percentile(v, 95)).toBeCloseTo(48);
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 99)).toBe(7);
  });
  it("computes uptime percentage", () => {
    expect(uptimePct([{ ok: 1 }, { ok: 1 }, { ok: 0 }])).toBe(66.67);
    expect(uptimePct([])).toBeNull();
  });
  it("derives the overall status banner", () => {
    expect(overallStatus([])).toBe("unknown");
    expect(overallStatus(["up", "up"])).toBe("operational");
    expect(overallStatus(["up", "down"])).toBe("degraded");
    expect(overallStatus(["down", "down"])).toBe("outage");
  });
});

describe("heartbeatOverdue", () => {
  const base = { intervalSec: 60, graceSec: 30, createdAt: 0 };
  it("is fine inside interval + grace", () => {
    expect(heartbeatOverdue({ ...base, now: 80_000, lastPingAt: 0 })).toBe(false);
  });
  it("is overdue after interval + grace", () => {
    expect(heartbeatOverdue({ ...base, now: 91_000, lastPingAt: 0 })).toBe(true);
  });
  it("measures from creation when never pinged", () => {
    expect(heartbeatOverdue({ ...base, now: 200_000, lastPingAt: null, createdAt: 150_000 })).toBe(false);
  });
});
