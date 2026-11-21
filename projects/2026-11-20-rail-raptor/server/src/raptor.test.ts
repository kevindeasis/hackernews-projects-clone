import { describe, expect, it } from "vitest";
import { formatTime, parseTime, search, type Network, type Route } from "./raptor.js";

const stop = (id: string) => ({ id, name: id, lat: 0, lon: 0 });
const mkRoute = (id: string, stops: string[], deps: number[], legMin: number): Route => ({
  id, name: id, operator: "T", stops,
  trips: deps.map((d) => ({ id: `${id}@${d}`, times: stops.map((_, i) => ({ arr: d + i * legMin, dep: d + i * legMin })) })),
});
const net = (routes: Route[], footpaths: Network["footpaths"] = []): Network => ({
  stops: new Map(["A", "B", "C", "D", "X"].map((s) => [s, stop(s)])),
  routes, footpaths,
});

describe("raptor", () => {
  it("finds a direct journey and picks the first departure after the requested time", () => {
    const n = net([mkRoute("r1", ["A", "B"], [480, 540, 600], 30)]);
    const [j] = search(n, { from: "A", to: "B", depart: 500 });
    expect(j.dep).toBe(540);
    expect(j.arr).toBe(570);
    expect(j.changes).toBe(0);
  });

  it("finds a journey with a change and honours the minimum change time", () => {
    const n = net([mkRoute("r1", ["A", "B"], [480], 30), mkRoute("r2", ["B", "C"], [509, 520], 30)]);
    const [j] = search(n, { from: "A", to: "C", depart: 470, minChange: 3 });
    expect(j.changes).toBe(1);
    expect(j.legs.map((l) => l.tripId)).toEqual(["r1@480", "r2@520"]); // 509 is missed: arrival 510 + 3 > 509
    expect(j.arr).toBe(550);
  });

  it("returns a Pareto set: slower direct vs faster with a change", () => {
    const slowDirect = mkRoute("direct", ["A", "C"], [480], 120);
    const fast1 = mkRoute("f1", ["A", "B"], [480], 20);
    const fast2 = mkRoute("f2", ["B", "C"], [510], 20);
    const js = search(net([slowDirect, fast1, fast2]), { from: "A", to: "C", depart: 470 });
    expect(js.map((j) => [j.changes, j.arr])).toEqual([[0, 600], [1, 530]]);
  });

  it("uses footpaths between stations", () => {
    const n = net([mkRoute("r1", ["A", "B"], [480], 30), mkRoute("r2", ["X", "C"], [520], 30)], [{ from: "B", to: "X", minutes: 8 }]);
    const [j] = search(n, { from: "A", to: "C", depart: 470 });
    expect(j.legs.map((l) => l.mode)).toEqual(["train", "walk", "train"]);
    expect(j.arr).toBe(550);
  });

  it("can start with a walk from the origin", () => {
    const n = net([mkRoute("r1", ["X", "C"], [500], 30)], [{ from: "A", to: "X", minutes: 10 }]);
    const [j] = search(n, { from: "A", to: "C", depart: 480 });
    expect(j.legs[0]).toMatchObject({ mode: "walk", dep: 490, arr: 500 });
  });

  it("returns nothing when unreachable, too late, or over the change limit", () => {
    const n = net([mkRoute("r1", ["A", "B"], [480], 30), mkRoute("r2", ["B", "C"], [600], 30)]);
    expect(search(n, { from: "A", to: "D", depart: 0 })).toEqual([]);
    expect(search(n, { from: "A", to: "B", depart: 481 })).toEqual([]);
    expect(search(n, { from: "A", to: "C", depart: 470, maxChanges: 0 })).toEqual([]);
  });

  it("formats and parses times", () => {
    expect(parseTime("09:05")).toBe(545);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("nope")).toBeNull();
    expect(formatTime(545)).toBe("09:05");
  });
});
