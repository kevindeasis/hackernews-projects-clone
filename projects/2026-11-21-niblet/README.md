# Niblet clone: baby weaning diary

Clone of **Niblet** (https://getniblet.app), posted by **MummyMahoney** in the November 2026 "Ask HN: What are you working on?" thread: https://news.ycombinator.com/item?id=50417407 (comment: https://news.ycombinator.com/item?id=50392205).

## What the original does
A weaning diary for parents: log the foods a baby tries and any reactions, so patterns can be spotted and shared with a GP.

## What this clone implements (v1)
- Diary: log date, meal, food, reaction severity (none/mild/moderate/severe) and notes; edit the reaction afterwards; delete entries.
- Automatic allergen tagging from the food name (egg, peanut, milk, wheat, soy, fish, shellfish, tree nut, sesame).
- Foods view: per-food times eaten, first tried, reaction rate, worst reaction, and a "suspect" flag (any moderate/severe reaction, or reacting on at least half of 2+ exposures).
- Allergen checklist: which common allergens have been introduced, when, and how it went.
- GP report: plain-text summary of the range, copyable from the UI (`GET /api/report`).
- Single baby profile name. SQLite persistence at `server/data/niblet.db` (override with `DATA_DIR`).

Not implemented yet: multiple babies, photos, accounts/sync, native mobile app, food database/nutrition, reminders, date-range filters in the UI.

## Stack
- React + Vite + TypeScript (client), with TanStack Query for data fetching/cache invalidation.
- Express + TypeScript (server), `zod` for request validation.
- `better-sqlite3`: zero-service persistence.
- `vitest` + `supertest`: tests for the analysis logic and the HTTP API.

## Run
```
npm install
npm run dev      # server on :3021, client on :5173 (proxying /api)
npm test
npm run build && npm start   # serves the built client from the Express server
```

## Ideas for next iterations
- Multiple baby profiles and date-range filters; edit entry details, not just reaction.
- Delayed-reaction window: link a reaction to foods eaten in the previous 48h rather than the same entry.
- Allergen introduction schedule/reminders (keep exposing regularly).
- Export PDF for the GP; photo attachments for rashes.
- Auth + sync so both parents can log; PWA/offline support.
