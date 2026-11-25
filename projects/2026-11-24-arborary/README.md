# Arborary clone

A clone of **Arborary** (https://arborary.world/, e.g. the city page `cities/ussfo.html`), a street-tree inventory
built from aerial imagery with a vision model. Posted by HN user **efromvt** in
[Ask HN: What are you working on? (November 2026)](https://news.ycombinator.com/item?id=50417407)
("street-tree inventory using a vision model for aerial tree detection; SF results so far, NYC in progress").

> **Caveat:** the original site could not be fetched from the build environment, and HN's API was blocked. This clone is built
> from the one-line HN description only, so the UI and data model are my interpretation, not a copy of the real thing.

## What the original does
Detects individual street trees from aerial imagery with a vision model and publishes a per-city inventory.

## What this clone implements (v1)
- Multiple cities, a Leaflet map showing each tree as a true-scale crown circle (radius from crown diameter), shaded by detector confidence and coloured by review status.
- "In view" stats that follow the map: tree count, density per km², canopy cover %, mean crown, % reviewed, top species.
- Human-in-the-loop review: a queue serving the lowest-confidence unreviewed detection, with confirm / reject / edit species and crown size.
- Add trees by clicking the map; import detections from CSV (`lat,lng,species,canopy_m,confidence`).
- ~2.7k **synthetic** demo trees seeded around SF's Mission district (deterministic; not real inventory data).

Not implemented: the actual vision model / imagery pipeline, real city data, auth, species-level pages, export.

## Stack
- React + Vite (TypeScript), Express, SQLite via `better-sqlite3` (zero external services)
- `react-leaflet` / Leaflet: map and true-metre crown circles
- `@tanstack/react-query`: data fetching/caching keyed on the map viewport
- `papaparse`: tolerant CSV import; `zod`: request validation; `vitest` + `supertest`: tests

## Run
```
npm install
npm run dev      # API :3001, client :5173
npm test         # server tests
npm run build && npm start   # serves built client from the API on :3001
```
Config (optional): see `.env.example`.

## Ideas for next iterations
- Wire in a real detector (e.g. run a segmentation model over imagery tiles and write rows with `source='detector'`).
- Import open municipal tree inventories (SF Street Tree List) and compare against detections (precision/recall view).
- Server-side clustering / vector tiles for 100k+ trees; heatmap layer using the existing `densityGrid`.
- Per-neighbourhood canopy equity stats, species diversity index, GeoJSON/CSV export.
- Reviewer accounts and audit trail; undo for reject.
