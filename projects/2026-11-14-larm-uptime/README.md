# Larm Uptime (clone of larm.dev)

A working v1 clone of **[Larm](https://larm.dev)**, an uptime-monitoring service with request traces, incident alerting and public status pages.

- **HN thread:** [Ask HN: What are you working on? (November 2026)](https://news.ycombinator.com/item?id=50417407)
- **Original author:** `shintoist` (top-level comment in that thread)

## What the original does

Larm runs HTTP / TCP / DNS / heartbeat checks from several regions, breaks each HTTP check into DNS / TCP / TLS / TTFB / transfer phases, only alerts when a majority of probes agree, tracks SSL certificate expiry, computes p50/p95/p99 response-time analytics, de-duplicates incidents, and publishes branded status pages. Has an API, CLI and MCP server, 14+ alert integrations, and is hosted in the EU.

## What this clone implements

- **Monitor types:** HTTP(S) (expected status, body keyword), TCP port, DNS (A/AAAA/CNAME/MX/TXT/NS), and **heartbeat** (cron-job monitoring: your job hits `/api/heartbeat/<token>`; missing pings trigger an incident).
- **Request trace** for HTTP checks: DNS, TCP, TLS, TTFB and transfer time, plus SSL certificate expiry.
- **Scheduler** (in-process, 1s tick) running each monitor at its own interval, with per-monitor timeout.
- **Incident handling:** a monitor goes *down* only after N consecutive failures (de-duplicates flapping), opens one incident, and resolves it on recovery.
- **Alerts:** webhook channels (Slack/Discord-compatible JSON) on down and recovery, plus a "send test alert" button.
- **Analytics:** uptime %, p50/p95/p99 over 1h/24h/7d/30d/90d, response-time chart, latest trace chart.
- **Public status pages** at `/status/<slug>` with an overall banner, per-component 90-day daily uptime bars and incident history.
- 90-day check retention (pruned every 6 hours).

**Not implemented yet:** multi-location probes and majority voting (single probe only), auth/teams (the admin UI and API are open, so run it locally or behind a proxy), email/SMS/PagerDuty integrations, custom domains/branding, subscriber notifications, maintenance windows, CLI/MCP server, editing a monitor after creation.

## Stack

Default stack (React + Express + TypeScript + SQLite).

| Library | Why |
| --- | --- |
| React 18 + Vite | UI and dev server |
| react-router-dom | Admin pages and the standalone public status page |
| @tanstack/react-query | Polling/caching API data (auto-refresh every 10s) |
| Recharts | Latency area chart and trace bar chart |
| Express + cors | REST API; also serves the built client in production |
| better-sqlite3 | Zero-service persistence |
| zod | Request validation |
| Node `http`/`https`/`net`/`dns` | Probes; socket events give the per-phase trace without extra deps |
| vitest + supertest | Unit and API tests (21 tests, including a full down -> alert -> recovery lifecycle) |

## Run it

```bash
npm install
npm run dev          # API on :3002, client on http://localhost:5173
```

Production-style:

```bash
npm run build && npm start    # everything on http://localhost:3002
npm test                      # server tests
```

Config (optional, see `.env.example`): `PORT`, `DB_PATH` (default `./larm.db`). Export them in your shell; there is no dotenv loader.

Heartbeat example: create a heartbeat monitor, then in your cron job: `curl -fsS http://localhost:3002/api/heartbeat/<token>`.

## Layout

```
server/src/  db.ts (schema) · checkers.ts (probes) · logic.ts (pure state machine/stats)
             engine.ts (scheduler, run+record) · alerts.ts · app.ts (REST routes)
client/src/  pages/ (Dashboard, MonitorPage, StatusPageAdmin, Settings, PublicStatusPage)
```

## Ideas for next iterations

1. Multi-location verification (run probes as separate worker processes/regions and require a majority before alerting).
2. Auth (e.g. a single admin password or OAuth) and API keys.
3. Edit monitors, tags/groups, bulk pause, maintenance windows.
4. More alert channels (email via SMTP, PagerDuty, Telegram) with retry/delivery logs.
5. Status page extras: manual incident updates, subscribers, custom branding.
6. Percentile roll-ups / downsampling for long ranges; certificate-expiry alerts.
7. A CLI (`larm monitors add ...`) and OpenAPI docs.
