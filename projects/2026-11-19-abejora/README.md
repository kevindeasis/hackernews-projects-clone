# Abejora clone (2026-11-19)

## Original
- **Project:** [abejora.com](https://abejora.com), a time tracking tool for freelancers and small teams.
- **HN:** [Ask HN: What Are You Working On? (November 2026)](https://news.ycombinator.com/item?id=50417407), posted by **david927**.
- **What the post says:** built after the author's previous timesheet tool raised prices; recently added access for AI agents, and rebuilt its core to support **change history and full undo/redo**. Original stack: Elixir + Phoenix LiveView.

> Note: abejora.com could not be fetched during the automated run (and HN itself was blocked), so this clone is built from the HN post text only, not from the live product. Feature set beyond history/undo is my reasonable interpretation of "time tracking for freelancers and small teams".

## What this clone implements
- Clients, projects (with hourly rate and colour) and time entries; live start/stop timer (starting a timer stops the running one); manual edit of description, start/end, billable flag.
- **Change history + undo/redo** (the headline feature): every create/edit/delete is stored as a before/after row snapshot; undo/redo re-applies snapshots; a new change discards the redo tail. Buttons plus Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z; History tab lists all changes.
- Reports grouped by project, client or day with date range, billable amount from project rates, and CSV export.

Not yet implemented: users/teams/auth, AI-agent API access, invoicing, timezone-aware day grouping, per-user history.

## Stack
TypeScript throughout, npm workspaces.
- React 18 + Vite (`client/`), TanStack Query for server state caching/invalidation.
- Express 4 (`server/`), zod for request validation.
- better-sqlite3: zero-service persistence in `data/abejora.db`.
- vitest + supertest for tests.

## Run
```
npm install
npm run dev     # server on :3019, client on :5173 (proxied)
npm test        # history/undo/redo, timer, reports, validation
npm run build && npm start   # single server serves built client on :3019
```
Config: see `.env.example`.

## Ideas for next iterations
- Multi-user teams with auth, per-user timers and shared undo history scoped by user.
- Token-authenticated REST/MCP endpoint so personal AI agents can log time.
- Invoices (PDF) from billable report lines; rounding rules.
- Weekly timesheet grid view; idle detection; keyboard-first entry.
- Undo grouping (batch several changes into one step) and history diff view.
