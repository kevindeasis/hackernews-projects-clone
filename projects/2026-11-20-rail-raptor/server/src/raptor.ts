/**
 * RAPTOR (Round-bAsed Public Transit Optimized Router), Delling et al. 2012.
 * Each round k finds the earliest arrival at every stop using at most k trips,
 * so the result is the Pareto set of (arrival time, number of changes).
 * Times are minutes since midnight on a single service day.
 */
export interface Stop { id: string; name: string; lat: number; lon: number }
export interface Trip { id: string; times: { arr: number; dep: number }[] }
/** A route = one stop pattern served by many trips (sorted by departure, no overtaking). */
export interface Route { id: string; name: string; operator: string; stops: string[]; trips: Trip[] }
export interface Footpath { from: string; to: string; minutes: number }
export interface Network { stops: Map<string, Stop>; routes: Route[]; footpaths: Footpath[] }

export interface Leg {
  mode: "train" | "walk";
  from: string; to: string;
  dep: number; arr: number;
  routeName?: string; operator?: string; tripId?: string;
  stopsPassed?: string[]; // intermediate stops for train legs
}
export interface Journey { dep: number; arr: number; changes: number; legs: Leg[] }

type Label =
  | { arr: number; kind: "start" }
  | { arr: number; kind: "trip"; route: Route; trip: Trip; boardIdx: number; alightIdx: number; prev: Label }
  | { arr: number; kind: "foot"; from: string; stop: string; prev: Label };

export interface SearchOptions {
  from: string; to: string; depart: number;
  maxChanges?: number;
  /** Minimum time needed to change between trains at a station. */
  minChange?: number;
}

export function search(net: Network, opts: SearchOptions): Journey[] {
  const { from, to, depart } = opts;
  const maxRounds = (opts.maxChanges ?? 4) + 1;
  const minChange = opts.minChange ?? 3;
  if (!net.stops.has(from) || !net.stops.has(to) || from === to) return [];

  // Index: stop -> [(route, position)]; stop -> outgoing footpaths.
  const stopRoutes = new Map<string, { route: Route; idx: number }[]>();
  for (const route of net.routes)
    route.stops.forEach((s, idx) => {
      if (!stopRoutes.has(s)) stopRoutes.set(s, []);
      stopRoutes.get(s)!.push({ route, idx });
    });
  const walks = new Map<string, Footpath[]>();
  for (const f of net.footpaths) {
    if (!walks.has(f.from)) walks.set(f.from, []);
    walks.get(f.from)!.push(f);
  }

  const best = new Map<string, Label>();
  const bestArr = (s: string) => best.get(s)?.arr ?? Infinity;
  const start: Label = { arr: depart, kind: "start" };
  best.set(from, start);
  let marked = new Set<string>([from]);
  // Walking from the origin counts as round 0.
  for (const f of walks.get(from) ?? []) {
    if (depart + f.minutes < bestArr(f.to)) {
      best.set(f.to, { arr: depart + f.minutes, kind: "foot", from, stop: f.to, prev: start });
      marked.add(f.to);
    }
  }

  const journeys: Journey[] = [];
  for (let k = 1; k <= maxRounds && marked.size; k++) {
    const prevBest = new Map(best); // labels reachable with <= k-1 trips
    const queue = new Map<Route, number>();
    for (const p of marked)
      for (const { route, idx } of stopRoutes.get(p) ?? []) {
        const q = queue.get(route);
        if (q === undefined || idx < q) queue.set(route, idx);
      }
    const improved = new Map<string, Label>();

    for (const [route, startIdx] of queue) {
      let trip: Trip | null = null;
      let boardIdx = -1;
      let boardLabel: Label | null = null;
      for (let i = startIdx; i < route.stops.length; i++) {
        const stop = route.stops[i];
        if (trip && boardLabel) {
          const arr = trip.times[i].arr;
          if (arr < Math.min(bestArr(stop), bestArr(to))) {
            const label: Label = { arr, kind: "trip", route, trip, boardIdx, alightIdx: i, prev: boardLabel };
            best.set(stop, label);
            improved.set(stop, label);
          }
        }
        // Can we board an earlier trip here?
        const pl = prevBest.get(stop);
        if (pl) {
          const ready = pl.arr + (pl.kind === "trip" ? minChange : 0);
          if (!trip || ready <= trip.times[i].dep) {
            const t = firstTripDepartingAfter(route, i, ready);
            if (t && t !== trip) { trip = t; boardIdx = i; boardLabel = pl; }
          }
        }
      }
    }

    // Footpaths from stops reached by train this round.
    for (const [p, label] of [...improved]) {
      for (const f of walks.get(p) ?? []) {
        const arr = label.arr + f.minutes;
        if (arr < Math.min(bestArr(f.to), bestArr(to))) {
          const l: Label = { arr, kind: "foot", from: p, stop: f.to, prev: label };
          best.set(f.to, l);
          improved.set(f.to, l);
        }
      }
    }
    marked = new Set(improved.keys());

    const t = improved.get(to);
    if (t) journeys.push(reconstruct(net, t, k - 1));
  }
  return journeys;
}

function firstTripDepartingAfter(route: Route, idx: number, ready: number): Trip | null {
  let lo = 0, hi = route.trips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.trips[mid].times[idx].dep >= ready) hi = mid; else lo = mid + 1;
  }
  return lo < route.trips.length ? route.trips[lo] : null;
}

function reconstruct(net: Network, end: Label, changes: number): Journey {
  const legs: Leg[] = [];
  const name = (id: string) => net.stops.get(id)?.name ?? id;
  let cur: Label = end;
  while (cur.kind !== "start") {
    if (cur.kind === "trip") {
      const { route, trip, boardIdx, alightIdx } = cur;
      legs.push({
        mode: "train",
        from: route.stops[boardIdx], to: route.stops[alightIdx],
        dep: trip.times[boardIdx].dep, arr: trip.times[alightIdx].arr,
        routeName: route.name, operator: route.operator, tripId: trip.id,
        stopsPassed: route.stops.slice(boardIdx + 1, alightIdx).map(name),
      });
    } else {
      const prevArr = cur.prev.arr;
      legs.push({ mode: "walk", from: cur.from, to: cur.stop, dep: prevArr, arr: cur.arr });
    }
    cur = cur.prev;
  }
  legs.reverse();
  // Shift walking legs so they depart when the previous train arrives; first walk starts at first train - walk time.
  const first = legs.findIndex((l) => l.mode === "train");
  if (first > 0) {
    // leading walk: depart as late as possible to just make the train
    const walk = legs[first - 1];
    const dur = walk.arr - walk.dep;
    walk.arr = legs[first].dep;
    walk.dep = walk.arr - dur;
  }
  return { dep: legs[0].dep, arr: end.arr, changes, legs };
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v < 24 * 60 ? v : null;
}
export function formatTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
