# Gangway clone

A self-hostable "publish a small site, get a URL" tool, cloned from **Gangway** by HN user **charlesabarnes**.

- Original: <https://gangway.sh/>
- HN thread: [Ask HN: What Are You Working On? (November 2026)](https://news.ycombinator.com/item?id=50417407)

## What the original does
From the HN comment: Gangway is an Apache-2.0, self-hostable tool for quickly deploying small sites and apps — "like Claude artifacts, but for open source harnesses".
I could not load gangway.sh from this environment (network restrictions), so this clone is built from that one-line description, not from the real product.

## What this clone implements (v1)
- Deploy a site from pasted HTML, a `.zip` (with assets), or the JSON/multipart API; a lone HTML file becomes `index.html`.
- Every deploy to an existing slug creates a new immutable **version**; activate any older version (rollback) instantly.
- Sites served at `/s/<slug>/` and, if `BASE_DOMAIN` is set, at `<slug>.<BASE_DOMAIN>`. Clean URLs (`/about` → `about.html`).
- Bearer-token auth for the management API; random readable slugs (`calm-otter-4821`) when none is given.
- Safety: path-traversal checks on upload and on serving, hidden files rejected, 10 MB / 500 file limits, `nosniff` header.
- React dashboard: sign in, deploy, list sites, live preview, version table, rollback, delete.

**Not yet:** multi-user accounts, per-site tokens, custom domains/TLS, server-side apps (only static sites), CLI, MCP/agent integration, version pruning, per-site isolation on a separate origin.

## Stack
- React + Vite + TypeScript (client), Express + TypeScript (server)
- `better-sqlite3` – zero-service metadata storage; site files live on disk under `data/`
- `multer` – multipart uploads; `adm-zip` – zip extraction; `zod` – request validation
- `@tanstack/react-query` – client data fetching; `vitest` + `supertest` – tests

## Run
```bash
npm install
cp .env.example .env   # optional; defaults: token "dev-token", port 3003
npm run dev            # server :3003, client (Vite) :5173
npm test
npm run build && npm start   # serves API + built client on :3003
```

API example:
```bash
curl -X POST localhost:3003/api/deploy -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' -d '{"slug":"hello","html":"<h1>Hi</h1>"}'
curl -X POST localhost:3003/api/deploy -H 'Authorization: Bearer dev-token' -F slug=hello -F archive=@site.zip
```

## Ideas for next iterations
- A small CLI (`gangway deploy ./dist`) and an MCP server so coding agents can publish artifacts
- Serve sites from a separate origin / sandbox CSP so untrusted HTML can't touch the dashboard's token
- Per-site API keys, user accounts, and password-protected sites
- Version pruning, diff view between versions, drag-and-drop folder upload
- Custom domains with automatic TLS (Caddy), and simple server-side functions
