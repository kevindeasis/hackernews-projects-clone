import Database from "better-sqlite3";
import type { Footpath, Network, Route, Stop } from "./raptor.js";
import { SEED_FOOTPATHS, SEED_ROUTES, SEED_STOPS } from "./seed.js";

export type Db = Database.Database;

export function openDb(file = ":memory:"): Db {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS stops (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, name TEXT NOT NULL, operator TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS route_stops (route_id TEXT NOT NULL, seq INTEGER NOT NULL, stop_id TEXT NOT NULL, PRIMARY KEY (route_id, seq));
    CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, route_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stop_times (trip_id TEXT NOT NULL, seq INTEGER NOT NULL, arr INTEGER NOT NULL, dep INTEGER NOT NULL, PRIMARY KEY (trip_id, seq));
    CREATE TABLE IF NOT EXISTS footpaths (from_stop TEXT NOT NULL, to_stop TEXT NOT NULL, minutes INTEGER NOT NULL, PRIMARY KEY (from_stop, to_stop));
  `);
  const { n } = db.prepare("SELECT COUNT(*) n FROM stops").get() as { n: number };
  if (n === 0) seed(db);
  return db;
}

/** Populate demo data: trips are generated from each route's pattern and headway. */
function seed(db: Db) {
  const tx = db.transaction(() => {
    const iStop = db.prepare("INSERT INTO stops VALUES (?,?,?,?)");
    for (const s of SEED_STOPS) iStop.run(s.id, s.name, s.lat, s.lon);
    const iRoute = db.prepare("INSERT INTO routes VALUES (?,?,?)");
    const iRs = db.prepare("INSERT INTO route_stops VALUES (?,?,?)");
    const iTrip = db.prepare("INSERT INTO trips VALUES (?,?)");
    const iSt = db.prepare("INSERT INTO stop_times VALUES (?,?,?,?)");
    for (const r of SEED_ROUTES) {
      iRoute.run(r.id, r.name, r.operator);
      r.pattern.forEach(([stop], seq) => iRs.run(r.id, seq, stop));
      // Run in both directions.
      for (const dir of [1, -1]) {
        const total = r.pattern[r.pattern.length - 1][1];
        const rid = dir === 1 ? r.id : `${r.id}-rev`;
        if (dir === -1) {
          iRoute.run(rid, r.name, r.operator);
          [...r.pattern].reverse().forEach(([stop], seq) => iRs.run(rid, seq, stop));
        }
        for (let dep = r.firstDep; dep <= r.lastDep; dep += r.headway) {
          const id = `${rid}@${dep}`;
          iTrip.run(id, rid);
          const offsets = dir === 1 ? r.pattern.map(([, m]) => m) : [...r.pattern].reverse().map(([, m]) => total - m);
          offsets.forEach((m, seq) => {
            const last = seq === offsets.length - 1, first = seq === 0;
            const arr = dep + m - (first ? 0 : 0);
            iSt.run(id, seq, arr, first ? arr : arr + (last ? 0 : 2));
          });
        }
      }
    }
    const iFp = db.prepare("INSERT INTO footpaths VALUES (?,?,?)");
    for (const f of SEED_FOOTPATHS) iFp.run(f.from, f.to, f.minutes);
  });
  tx();
}

/** Load the whole timetable into the in-memory structures RAPTOR scans. */
export function loadNetwork(db: Db): Network {
  const stops = new Map<string, Stop>();
  for (const s of db.prepare("SELECT * FROM stops").all() as Stop[]) stops.set(s.id, s);
  const routes: Route[] = [];
  for (const r of db.prepare("SELECT * FROM routes").all() as { id: string; name: string; operator: string }[]) {
    const rs = (db.prepare("SELECT stop_id FROM route_stops WHERE route_id=? ORDER BY seq").all(r.id) as { stop_id: string }[]).map((x) => x.stop_id);
    const trips = (db.prepare("SELECT id FROM trips WHERE route_id=?").all(r.id) as { id: string }[]).map((t) => ({
      id: t.id,
      times: db.prepare("SELECT arr, dep FROM stop_times WHERE trip_id=? ORDER BY seq").all(t.id) as { arr: number; dep: number }[],
    }));
    trips.sort((a, b) => a.times[0].dep - b.times[0].dep);
    routes.push({ ...r, stops: rs, trips });
  }
  const footpaths = (db.prepare("SELECT from_stop, to_stop, minutes FROM footpaths").all() as { from_stop: string; to_stop: string; minutes: number }[])
    .map((f): Footpath => ({ from: f.from_stop, to: f.to_stop, minutes: f.minutes }));
  return { stops, routes, footpaths };
}
