# Cinema Showtimes (clone of "Eigakan Guide")

## Original
- **Project:** Eigakan Guide — https://eigakanguide.jp/en — a cinema showtime aggregator for Japan, searchable by area, cinema, time and format.
- **HN source:** "Ask HN: What are you working on? (October 2026)" (https://news.ycombinator.com/item?id=49927188), read via the mirror https://zeli.app/story/49927188. Author username: not shown by the mirror (look it up in the HN thread). The scheduled seed thread (item 50417407, November 2026) could not be read from this environment.
- Note: the Hacker News API / Algolia are blocked (403) from the sandbox, so the project was chosen from a mirrored thread.

## What this clone implements
- SQLite schema for cinemas, films, showtimes, with deterministic demo data (Tokyo areas, 7 days).
- `GET /api/showtimes` filtering by area, cinema, film, format, date, earliest start time; `GET /api/filters` for dropdown options.
- React UI: filter bar, results grouped by film then cinema, time chips with format.
- Tests (vitest + supertest) for the search logic and API validation.

**Not yet:** real data ingestion/scraping, multiple languages, map view, ticket links, user accounts, time zones.

## Stack
- React + Vite (TypeScript) – fast UI tooling
- Express + zod – API and query validation
- better-sqlite3 – zero-service persistence
- @tanstack/react-query – data fetching/caching
- vitest + supertest – tests

## Run
```
npm install
npm run dev     # API :3001, client :5173
npm test
npm run build && npm start   # serves API + built client on :3001
```
Config: see `.env.example`.

## Ideas for next iterations
- Scrapers/adapters per cinema chain that fill the `showtimes` table on a schedule.
- Japanese/English toggle; subtitle (jimaku) flag per showing.
- Geolocation / "near me" using cinema coordinates.
- Deep links to cinema booking pages; iCal export.
