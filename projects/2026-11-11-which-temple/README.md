# Which Temple? (clone)

A clone of **[whichtemple.in](https://www.whichtemple.in)**, built by HN user **lappet** and shared in the
[Ask HN: What Are You Working On? (August 2026)](https://news.ycombinator.com/item?id=49233423) thread.

## What the original does
A catalogue of ~2,700 Indian temples that shows a random temple on each visit, with a map view.
(HN was unreachable from the build sandbox; this description comes from a mirror of the thread, and the site itself could not be fetched, so details are inferred.)

## What this clone implements
- Random-temple button (respects current filters)
- Searchable/filterable list (free text, state, tradition)
- Interactive map (Leaflet + OpenStreetMap) with markers; selecting a temple flies to it
- REST API: `GET /api/temples`, `/api/temples/random`, `/api/temples/:id`, `/api/facets`
- Seeded with ~40 well-known temples (coordinates approximate)

Not yet: the full 2,700-temple dataset, photos, user submissions, deep links to a temple, pagination.

## Stack
React + Vite + TypeScript (client), Express + TypeScript (server). Libraries: `better-sqlite3` (zero-service storage), `zod` (query validation), `@tanstack/react-query` (data fetching/caching), `leaflet` + `react-leaflet` (maps), `vitest` + `supertest` (tests).

## Run
```
npm install
npm run dev     # API on :3001, client on :5173
npm test
npm run build && npm start   # serves built client + API on :3001
```
Config: copy `.env.example` to `.env` (`PORT`, `DB_PATH`). The DB is created and seeded on first start.

## Ideas for next iterations
- Import a real dataset (OpenStreetMap `amenity=place_of_worship` + Wikidata) and add pagination/clustering
- Shareable URLs per temple (`/temple/:id`) and "temples near me" via geolocation
- Photos, opening hours, festivals; user-submitted corrections
- Marker clustering and a "daily temple" mode
