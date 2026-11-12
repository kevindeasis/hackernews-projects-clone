# Dumpling Money (clone)

**Original:** Dumpling Money by HN user **joewhale** — https://dumplingmoney.com
**HN thread:** [Ask HN: What are you working on?](https://news.ycombinator.com/item?id=50417407) (Nov 2026)

## What the original does
A personal finance app for tracking transactions, cash flow and net worth.

## What this clone implements (v1)
- Accounts (assets and liabilities) with opening balances
- Add / delete / search transactions (signed amounts, free-text categories)
- CSV import per account (`date`, `description`, `amount` — or `debit`/`credit`; optional `category`), with a small keyword auto-categoriser
- Reports: month-by-month income vs expenses, spending by category, month-end net worth (assets, liabilities)
- Transfers (category `Transfer`) are excluded from cash flow but still count toward balances
- Demo data is seeded on first start

**Not yet:** auth / multi-user, multi-currency, budgets, recurring transactions, bank sync, editing transactions, date-range filters in the UI, mobile polish. I have not seen the original's UI beyond its description, so features are inferred from the HN blurb.

## Stack
Chosen per the default: React + Express + TypeScript + SQLite.

- **Vite + React 18** – fast dev server, simple SPA
- **@tanstack/react-query** – server-state caching and invalidation after mutations
- **Recharts** – line/bar/pie charts with little code
- **Express 4** – small REST API under `/api`
- **better-sqlite3** – zero-service persistence; synchronous API keeps report SQL simple
- **zod** – request validation
- **csv-parse** – robust bank-CSV parsing
- **vitest + supertest** – unit tests for the money logic and API

All money is stored as integer cents.

## Run it
```bash
npm install
npm run dev      # API on :3001, client on :5173 (proxies /api)
npm test         # server unit + API tests
npm run build && npm start   # serves API + built client on :3001
```
`DB_PATH` (default `server/data/dumpling.db`) and `PORT` can be set via env.

## Ideas for next iterations
- Edit transactions; bulk re-categorise; user-defined category rules
- Budgets per category with progress bars
- Recurring transactions and a cash-flow forecast
- Date-range picker and per-account filters in the UI
- Multi-currency with FX rates; account-level balance snapshots for investments
- Auth + per-user data; export to CSV
- Code-split the client bundle (Recharts makes it ~600 kB)
