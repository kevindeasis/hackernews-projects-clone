# Rail Raptor (railraptor.com clone)

## Original
- **Project:** [RailRaptor](https://railraptor.com) by HN user `marcusdev`.
- **HN thread:** [Ask HN: What Are You Working On? (April 2026)](https://news.ycombinator.com/item?id=47741527) (found via third-party mirrors, since news.ycombinator.com and the HN API were blocked from the build environment).
- **What it does:** an offline, client-side UK rail journey planner that uses a modified RAPTOR algorithm to find routes the operators' own planners don't show.

## What this clone implements
- A real RAPTOR implementation (`server/src/raptor.ts`): round-based search returning the Pareto set of (arrival time, number of changes), minimum change time, walking transfers between stations (e.g. King's Cross / St Pancras / Euston) and walking from the origin.
- SQLite-backed timetable (stops, routes, trips, stop times, footpaths), loaded into memory at start-up.
- An illustrative, **fictional** demo timetable of 20 UK stations and 13 two-way routes (`server/src/seed.ts`). It is not real data.
- Express API (`GET /api/stations`, `GET /api/journeys?from=&to=&depart=HH:MM&maxChanges=`) and a React UI showing each option with legs, intermediate stops and walks.

Not yet implemented: real GTFS / National Rail data, running the search in the browser (the original is client-side/offline), calendar/day-of-week services, trips past midnight, a map, "arrive by" searches.

## Stack
- React + Vite (TypeScript) client; `@tanstack/react-query` for data fetching.
- Express + `zod` for the API and query validation.
- `better-sqlite3` for zero-service persistence.
- `vitest` + `supertest` for tests (unit tests of the algorithm and API tests on the seed network).

## Run
```bash
npm install
npm run dev     # server on :3020, client on :5173 (proxied)
npm test
npm run build && npm start   # production, serves client from :3020
```
Config: `PORT` (default 3020), `DB_PATH` (default `./rail.sqlite`).

## Ideas for next iterations
- Import a real GTFS feed (e.g. a UK rail GTFS) and add calendar handling.
- Move the RAPTOR core to a shared package and run it in the browser/Web Worker for offline use.
- Add a map (Leaflet) showing the route, "arrive by" search, and via/avoid-station options.
- Support overnight trips (times > 24:00) and per-station minimum interchange times.
- Add a profile (range) RAPTOR query to show all departures within a window.
