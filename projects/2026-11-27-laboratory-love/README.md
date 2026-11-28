# Laboratory.love clone

Clone of [laboratory.love](https://laboratory.love): crowdfund independent lab testing of specific consumer products (aimed at endocrine-disrupting plastic chemicals).

## Original
- Found in: [Ask HN: What Are You Working On?](https://news.ycombinator.com/item?id=50417407) (the seed thread; the page fetched this run was titled "June 2025"), comment by **cjflog**.
- Per the author's comment: find or suggest a product, contribute to its testing fund, get detailed lab results. If a product misses its goal within 365 days, backers are refunded automatically. Results are published openly; ISO 17025-accredited labs test three samples from different production lots, with the same methodology as PlasticList.org.
- Caveat: laboratory.love itself could not be fetched in this run (sandbox permission), so this clone is built from the HN description only, not the live site.

## Implemented (v1)
- Product catalogue with search and status filter; product page with funding progress and days left.
- Suggest a product (starts as `suggested`); staff approve it and set the goal (opens a 365-day window).
- Pledges (min $1, **no real payments**). Reaching the goal moves the product to `testing`.
- Auto-refund: products still funding past their deadline become `expired` and all pledges are marked refunded (applied lazily on each API request, plus `POST /api/admin/sweep`).
- Staff publish results; the API enforces exactly 3 lots. Results table shows per-lot values, "ND" below the limit of quantification, and a detected-in-N-lots roll-up.
- Seed script with **synthetic** demo data.

## Not yet
User accounts, real payments (Stripe), staff UI (approve/publish are API-only, via `x-admin-token`), email notifications, protocol/lab pages, comparison with PlasticList data.

## Stack
TypeScript throughout. React + Vite (client), Express (server), `better-sqlite3` (zero-service persistence), `zod` (request validation), `@tanstack/react-query` (data fetching), `vitest` + `supertest` (API tests).

## Run
```bash
npm install
npm run seed -w server   # optional demo data
npm run dev              # client :5173, API :3001
npm test
npm run build && npm start   # serves built client from the API
```
Copy `.env.example` to `.env` to set `ADMIN_TOKEN` (default `dev-admin`).

Staff example:
```bash
curl -X POST localhost:3001/api/products/4/approve -H 'x-admin-token: dev-admin' -H 'content-type: application/json' -d '{"goal_cents":150000}'
```

## Ideas for next iterations
- Stripe pre-authorised pledges so refunds are real.
- Admin UI for approving suggestions and entering lab results (CSV upload).
- Product images, barcode/UPC lookup, comments and votes on suggestions.
- Highlight results against regulatory/health thresholds; charts across products.
- Email backers when funded / results published / refunded.
