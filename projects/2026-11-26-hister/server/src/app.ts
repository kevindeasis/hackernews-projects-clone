import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { extractText, fetchPage, normalizeUrl } from "./extract.js";
import { addBlock, recent, search, stats, upsertPage } from "./store.js";

export interface AppDeps {
  /** Overridable for tests so no network is needed. */
  fetcher?: typeof fetchPage;
}

export function createApp(db: Db, deps: AppDeps = {}) {
  const fetcher = deps.fetcher ?? fetchPage;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb", type: ["application/json", "text/plain"] }) /* bookmarklet posts text/plain to avoid CORS preflight */);

  app.get("/api/search", (req, res) => {
    const q = String(req.query.q ?? "");
    const domain = req.query.domain ? String(req.query.domain) : undefined;
    res.json(search(db, q, { domain }));
  });

  app.get("/api/pages", (_req, res) => res.json(recent(db)));
  app.get("/api/stats", (_req, res) => res.json(stats(db)));

  // Used by the bookmarklet / a browser extension: the browser already has the page, so it posts it.
  app.post("/api/pages", (req, res) => {
    const body = z
      .object({ url: z.string().url(), title: z.string().default(""), text: z.string().optional(), html: z.string().optional() })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    let { title, text } = body.data;
    if (!text && body.data.html) {
      const ex = extractText(body.data.html);
      text = ex.text;
      title = title || ex.title;
    }
    try {
      res.json(upsertPage(db, { url: body.data.url, title, text: text ?? "" }));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Ask the server to download and index a URL.
  app.post("/api/pages/fetch", async (req, res) => {
    const body = z.object({ url: z.string().url() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "A valid url is required" });
    try {
      const { url } = normalizeUrl(body.data.url);
      const page = await fetcher(url);
      res.json(upsertPage(db, { url, ...page }));
    } catch (e) {
      res.status(502).json({ error: (e as Error).message });
    }
  });

  app.delete("/api/pages/:id", (req, res) => {
    const r = db.prepare("DELETE FROM pages WHERE id = ?").run(Number(req.params.id));
    res.status(r.changes ? 204 : 404).end();
  });

  app.get("/api/blocklist", (_req, res) =>
    res.json((db.prepare("SELECT domain FROM blocklist ORDER BY domain").all() as { domain: string }[]).map((r) => r.domain)),
  );
  app.post("/api/blocklist", (req, res) => {
    const body = z.object({ domain: z.string().min(3) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "domain required" });
    addBlock(db, body.data.domain);
    res.status(201).json({ ok: true });
  });
  app.delete("/api/blocklist/:domain", (req, res) => {
    db.prepare("DELETE FROM blocklist WHERE domain = ?").run(req.params.domain);
    res.status(204).end();
  });

  return app;
}
