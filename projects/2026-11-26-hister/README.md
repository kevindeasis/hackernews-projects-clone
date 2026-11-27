# Hister clone — self-hosted full-text search over the pages you visit

Clone of **Hister** by HN user **asciimoo**, shared in the
[Ask HN: What Are You Working On? (July 2026)](https://news.ycombinator.com/item?id=48884984) thread
(original: <https://hister.org/> · <https://github.com/asciimoo/hister>).

## What the original does
A self-hosted full-text indexer for pages you have visited (and local files), with a web and terminal search interface, so you can find
"that article I read last month" without trusting a cloud service.

## What this clone implements (v1)
- Index pages three ways: server-side fetch of a URL, a **bookmarklet** that posts the rendered page text from your browser (works for logged-in pages), or `POST /api/pages`.
- SQLite **FTS5** search with Porter stemming, `bm25` ranking (title > url > body) plus a boost for pages you revisit, and highlighted snippets.
- Query syntax: `terms` (AND, last term is a prefix), `"exact phrase"`, `-exclude`, `domain:example.com` (includes subdomains).
- Re-visiting a URL bumps its visit count and refreshes its content rather than duplicating it.
- Domain **blocklist** (also purges already indexed pages from that domain), "Forget" per page, stats.
- Zero external services: one SQLite file (`server/data/hister.db`).

Not yet implemented: browser extension for automatic capture, importing browser history, local file indexing, terminal client, PDF/non-HTML content, auth.

## Stack (TypeScript; React + Vite client, Express server)
- `better-sqlite3` — synchronous SQLite with FTS5 built in, which is the whole search engine.
- `cheerio` — HTML parsing / readable-text extraction.
- `express`, `cors`, `zod` — API and request validation.
- `@tanstack/react-query` — client data fetching/cache.
- `vitest` + `supertest` — tests of query parsing, extraction, ranking, and the API.

## Run
```bash
npm install
npm run dev     # client http://localhost:5173, API http://localhost:3001
npm test
npm run build && npm start   # single server on :3001 serving the built client
```
Open Settings to index a URL or grab the bookmarklet (when running via `npm run dev` the bookmarklet points to port 3001).

## Ideas for next iterations
- Browser extension (WebExtension) to capture pages automatically, honouring the blocklist and private windows.
- Import Chrome/Firefox history and bookmarks files; periodic re-crawl.
- Index local folders (markdown, PDF, text) with file watching.
- Highlight-aware result cache, "similar pages", date filters, and keyboard navigation.
- Optional auth token for the ingest endpoints; SSRF guard on server-side fetch if exposed beyond localhost.
- A CLI/TUI search client.
