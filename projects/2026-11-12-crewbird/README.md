# Crewbird clone

Clone of **Crewbird** (https://getcrewbird.com/), a field-service management + CRM app for service businesses.

- Original posted by HN user **jzig** in [Ask HN: What Are You Working On? (November 2026)](https://news.ycombinator.com/item?id=50417407).
- Original: manage customers, jobs and technicians, with Google Local Service Ads leads flowing straight into the CRM.

## What this clone implements
- Customers and technicians (CRUD-lite: list/add).
- Jobs with a lifecycle: lead → scheduled → in progress → done → invoiced → paid (illegal transitions rejected).
- Per-technician day schedule with **double-booking detection** (409 on overlap).
- Pipeline (kanban-style) view and outstanding/collected revenue KPIs.
- Public "Request service" lead form that creates (or reuses, by email/phone) a customer and a lead job — a stand-in for the Local Service Ads integration.

**Not yet:** auth, editing/deleting records, drag-and-drop scheduling, real invoices/payments, SMS/email notifications, actual Google LSA integration.

## Stack
Chosen defaults: TypeScript, React (Vite) + Express, SQLite.
- `better-sqlite3` – zero-service persistence. `zod` – request validation. `express`/`cors` – API.
- `@tanstack/react-query` – data fetching/cache invalidation. `vitest` + `supertest` – tests.

## Run
```
npm install
npm run dev     # API :3001, client :5173 (proxied)
npm test
npm run build && npm start   # serves client from the API on :3001
```
Seed data is created on first start (`server/data/crewbird.db`, git-ignored; override with `DB_PATH`).

## Ideas for next iterations
- Edit/delete/reschedule jobs via drag-and-drop calendar (week view).
- Customer detail page (`GET /api/customers/:id` already returns job history).
- PDF invoices and Stripe payments; reminders by SMS/email.
- Webhook endpoint for real lead sources; technician mobile view.
- Auth and multi-tenant accounts.
