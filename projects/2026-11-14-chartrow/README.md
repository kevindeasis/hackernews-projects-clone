# Chartrow clone

Clone of **[Chartrow](https://chartrow.com)**, a side project posted by HN user **chartrow** in the
["Ask HN: What Are You Working On? (November 2026)"](https://news.ycombinator.com/item?id=50417407) thread.

## What the original does
Dense stock-market visualizations: drawdown charts, ETF holdings views, and top-performer heatmaps.
(Based on the HN comment only — chartrow.com could not be fetched from the build environment, so UI details are interpreted.)

## What this clone implements (v1)
- **Drawdowns**: pick any security + range; price vs. running peak, underwater chart, max drawdown (peak, trough, recovery date).
- **Heatmap**: treemap of all stocks sized by market cap, coloured by return over 1w–1y, plus top/worst performers.
- **ETF holdings**: weights, per-holding return and weighted contribution over a period.
- **CSV import**: paste `date,close` or a Yahoo-style export to add/replace real price history for any symbol.
- SQLite persistence, seeded on first start.

**Not yet**: real market data feeds, intraday data, auth/watchlists, real ETF constituents, sector grouping in the treemap.
Seed prices are **synthetic seeded random walks** (offline, deterministic) for a fictional universe — not real quotes.

## Stack
- React 18 + Vite + TypeScript — frontend
- Express + TypeScript — API
- better-sqlite3 — zero-service persistence
- Recharts — line/area charts and the treemap heatmap
- TanStack Query — data fetching/caching
- zod — request validation; vitest + supertest — tests

## Run
```bash
npm install
npm run dev     # API :3001, client :5173 (proxied)
npm test        # server logic + API tests
npm run build && npm start   # serves client from the API on :3001
```

## Ideas for next iterations
- Pull real data (Stooq / Yahoo / Alpha Vantage) on a schedule instead of CSV-only.
- Drawdown comparison overlay of several tickers; list of historical drawdown episodes.
- Treemap grouped by sector; ETF holdings treemap; sortable/filterable tables.
- Watchlists and shareable chart URLs; light theme.
- Code-split Recharts (bundle is >500 kB).
