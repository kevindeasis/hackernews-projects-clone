import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import { DNS_RECORD_TYPES } from "./checkers.js";
import { runCheck, type MonitorRow } from "./engine.js";
import { overallStatus, percentile, uptimePct } from "./logic.js";
import { dispatchAlert, type Sender } from "./alerts.js";

const RANGES: Record<string, number> = { "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 };

const monitorSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(["http", "tcp", "dns", "heartbeat"]),
    target: z.string().trim().max(500).default(""),
    port: z.number().int().min(1).max(65535).nullish(),
    intervalSec: z.number().int().min(10).max(86_400).default(180),
    timeoutMs: z.number().int().min(500).max(60_000).default(10_000),
    expectedStatus: z.number().int().min(100).max(599).nullish(),
    keyword: z.string().max(200).nullish(),
    recordType: z.enum(DNS_RECORD_TYPES).default("A"),
    graceSec: z.number().int().min(0).max(86_400).default(60),
    failThreshold: z.number().int().min(1).max(10).default(2),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "heartbeat" && !v.target) ctx.addIssue({ code: "custom", path: ["target"], message: "Target is required" });
    if (v.type === "http" && !/^https?:\/\//i.test(v.target))
      ctx.addIssue({ code: "custom", path: ["target"], message: "HTTP monitors need an http(s):// URL" });
    if (v.type === "tcp" && !v.port) ctx.addIssue({ code: "custom", path: ["port"], message: "Port is required for TCP" });
  });

function toApi(m: MonitorRow) {
  return {
    id: m.id, name: m.name, type: m.type, target: m.target, port: m.port,
    intervalSec: m.interval_sec, timeoutMs: m.timeout_ms, expectedStatus: m.expected_status,
    keyword: m.keyword, recordType: m.record_type, graceSec: m.grace_sec, failThreshold: m.fail_threshold,
    paused: !!m.paused, status: m.status, lastCheckedAt: m.last_checked_at, lastPingAt: m.last_ping_at,
    heartbeatPath: m.heartbeat_token ? `/api/heartbeat/${m.heartbeat_token}` : null,
    createdAt: m.created_at,
  };
}

export function createApp(db: Db, opts: { send?: Sender; serveStatic?: string } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const getMonitor = (id: number) => db.prepare("SELECT * FROM monitors WHERE id=?").get(id) as MonitorRow | undefined;
  const idParam = (v: string) => Number.parseInt(v, 10);

  // ---- Heartbeat ping (GET or POST, public) ----
  app.all("/api/heartbeat/:token", (req, res) => {
    const m = db.prepare("SELECT * FROM monitors WHERE heartbeat_token=?").get(req.params.token) as MonitorRow | undefined;
    if (!m) return res.status(404).json({ error: "Unknown heartbeat token" });
    const now = Date.now();
    db.prepare("UPDATE monitors SET last_ping_at=? WHERE id=?").run(now, m.id);
    // A ping on a "down" heartbeat monitor immediately counts as a successful check.
    runCheck(db, m.id, opts.send, { ok: true, latencyMs: null }, now)
      .then(() => res.json({ ok: true }))
      .catch((e) => res.status(500).json({ error: String(e) }));
  });

  // ---- Monitors ----
  app.get("/api/monitors", (_req, res) => {
    const rows = db.prepare("SELECT * FROM monitors ORDER BY id").all() as MonitorRow[];
    const since = Date.now() - 86_400_000;
    res.json(
      rows.map((m) => {
        const checks = db.prepare("SELECT ok, latency_ms FROM checks WHERE monitor_id=? AND at>=?").all(m.id, since) as { ok: number; latency_ms: number | null }[];
        const lat = checks.filter((c) => c.ok && c.latency_ms != null).map((c) => c.latency_ms!);
        return { ...toApi(m), uptime24h: uptimePct(checks), p95: percentile(lat, 95) };
      }),
    );
  });

  app.post("/api/monitors", (req, res) => {
    const parsed = monitorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const v = parsed.data;
    const token = v.type === "heartbeat" ? crypto.randomBytes(12).toString("hex") : null;
    const info = db
      .prepare(
        `INSERT INTO monitors (name,type,target,port,interval_sec,timeout_ms,expected_status,keyword,record_type,heartbeat_token,grace_sec,fail_threshold,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(v.name, v.type, v.target, v.port ?? null, v.intervalSec, v.timeoutMs, v.expectedStatus ?? null, v.keyword || null, v.recordType, token, v.graceSec, v.failThreshold, Date.now());
    res.status(201).json(toApi(getMonitor(Number(info.lastInsertRowid))!));
  });

  app.get("/api/monitors/:id", (req, res) => {
    const m = getMonitor(idParam(req.params.id));
    if (!m) return res.status(404).json({ error: "Not found" });
    const range = RANGES[String(req.query.range)] ? String(req.query.range) : "24h";
    const since = Date.now() - RANGES[range];
    const checks = db
      .prepare("SELECT at, ok, latency_ms AS latencyMs, status_code AS statusCode, error, dns_ms AS dnsMs, tcp_ms AS tcpMs, tls_ms AS tlsMs, ttfb_ms AS ttfbMs, transfer_ms AS transferMs, cert_expires_at AS certExpiresAt FROM checks WHERE monitor_id=? AND at>=? ORDER BY at")
      .all(m.id, since) as { at: number; ok: number; latencyMs: number | null; certExpiresAt: number | null }[];
    const lat = checks.filter((c) => c.ok && c.latencyMs != null).map((c) => c.latencyMs!);
    const incidents = db.prepare("SELECT id, started_at AS startedAt, resolved_at AS resolvedAt, cause FROM incidents WHERE monitor_id=? ORDER BY started_at DESC LIMIT 20").all(m.id);
    const lastCert = [...checks].reverse().find((c) => c.certExpiresAt)?.certExpiresAt ?? null;
    res.json({
      monitor: toApi(m),
      range,
      stats: { uptime: uptimePct(checks), p50: percentile(lat, 50), p95: percentile(lat, 95), p99: percentile(lat, 99), checks: checks.length, certExpiresAt: lastCert },
      checks: checks.slice(-500),
      incidents,
    });
  });

  app.patch("/api/monitors/:id", (req, res) => {
    const m = getMonitor(idParam(req.params.id));
    if (!m) return res.status(404).json({ error: "Not found" });
    const body = z.object({ paused: z.boolean().optional(), name: z.string().trim().min(1).max(100).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    if (body.data.paused !== undefined) db.prepare("UPDATE monitors SET paused=? WHERE id=?").run(body.data.paused ? 1 : 0, m.id);
    if (body.data.name) db.prepare("UPDATE monitors SET name=? WHERE id=?").run(body.data.name, m.id);
    res.json(toApi(getMonitor(m.id)!));
  });

  app.delete("/api/monitors/:id", (req, res) => {
    db.prepare("DELETE FROM monitors WHERE id=?").run(idParam(req.params.id));
    res.status(204).end();
  });

  app.post("/api/monitors/:id/check", async (req, res) => {
    const m = getMonitor(idParam(req.params.id));
    if (!m) return res.status(404).json({ error: "Not found" });
    const out = await runCheck(db, m.id, opts.send);
    res.json({ result: out?.result, status: getMonitor(m.id)!.status });
  });

  // ---- Alert channels ----
  app.get("/api/channels", (_req, res) => res.json(db.prepare("SELECT id, name, url FROM alert_channels ORDER BY id").all()));
  app.post("/api/channels", (req, res) => {
    const p = z.object({ name: z.string().trim().min(1).max(60), url: z.string().url().regex(/^https?:\/\//) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    const info = db.prepare("INSERT INTO alert_channels (name,url) VALUES (?,?)").run(p.data.name, p.data.url);
    res.status(201).json({ id: Number(info.lastInsertRowid), ...p.data });
  });
  app.delete("/api/channels/:id", (req, res) => {
    db.prepare("DELETE FROM alert_channels WHERE id=?").run(idParam(req.params.id));
    res.status(204).end();
  });
  app.post("/api/channels/test", async (_req, res) => {
    const delivered = await dispatchAlert(db, { kind: "recovered", monitorName: "Test monitor", target: "https://example.com", at: Date.now() }, opts.send);
    res.json({ delivered });
  });

  // ---- Incidents feed ----
  app.get("/api/incidents", (_req, res) => {
    res.json(
      db.prepare(
        `SELECT i.id, i.monitor_id AS monitorId, m.name AS monitorName, i.started_at AS startedAt, i.resolved_at AS resolvedAt, i.cause
         FROM incidents i JOIN monitors m ON m.id=i.monitor_id ORDER BY i.started_at DESC LIMIT 50`,
      ).all(),
    );
  });

  // ---- Status pages ----
  const pageSchema = z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "lowercase letters, digits and dashes"),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(500).default(""),
    monitorIds: z.array(z.number().int()).default([]),
  });
  app.get("/api/status-pages", (_req, res) => {
    const pages = db.prepare("SELECT id, slug, title, description FROM status_pages ORDER BY id").all() as { id: number }[];
    res.json(pages.map((p) => ({ ...p, monitorIds: (db.prepare("SELECT monitor_id FROM status_page_monitors WHERE page_id=?").all(p.id) as { monitor_id: number }[]).map((r) => r.monitor_id) })));
  });
  app.post("/api/status-pages", (req, res) => {
    const p = pageSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.flatten() });
    if (db.prepare("SELECT 1 FROM status_pages WHERE slug=?").get(p.data.slug)) return res.status(409).json({ error: "Slug already in use" });
    const tx = db.transaction(() => {
      const info = db.prepare("INSERT INTO status_pages (slug,title,description) VALUES (?,?,?)").run(p.data.slug, p.data.title, p.data.description);
      const id = Number(info.lastInsertRowid);
      for (const mid of p.data.monitorIds) db.prepare("INSERT OR IGNORE INTO status_page_monitors (page_id,monitor_id) SELECT ?, id FROM monitors WHERE id=?").run(id, mid);
      return id;
    });
    res.status(201).json({ id: tx(), ...p.data });
  });
  app.delete("/api/status-pages/:id", (req, res) => {
    db.prepare("DELETE FROM status_pages WHERE id=?").run(idParam(req.params.id));
    res.status(204).end();
  });

  /** Public status page data: current state, 90-day daily uptime, recent incidents. */
  app.get("/api/public/status/:slug", (req, res) => {
    const page = db.prepare("SELECT id, slug, title, description FROM status_pages WHERE slug=?").get(req.params.slug) as { id: number; slug: string; title: string; description: string } | undefined;
    if (!page) return res.status(404).json({ error: "Status page not found" });
    const monitors = db
      .prepare("SELECT m.* FROM monitors m JOIN status_page_monitors s ON s.monitor_id=m.id WHERE s.page_id=? ORDER BY m.id")
      .all(page.id) as MonitorRow[];
    const since = Date.now() - 90 * 86_400_000;
    const components = monitors.map((m) => {
      const rows = db.prepare("SELECT at, ok FROM checks WHERE monitor_id=? AND at>=?").all(m.id, since) as { at: number; ok: number }[];
      const byDay = new Map<string, { ok: number }[]>();
      for (const r of rows) {
        const day = new Date(r.at).toISOString().slice(0, 10);
        (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(r);
      }
      const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({ date, uptime: uptimePct(c) }));
      return { id: m.id, name: m.name, status: m.status, uptime90d: uptimePct(rows), days };
    });
    const ids = monitors.map((m) => m.id);
    const incidents = ids.length
      ? db.prepare(`SELECT i.id, m.name AS monitorName, i.started_at AS startedAt, i.resolved_at AS resolvedAt FROM incidents i JOIN monitors m ON m.id=i.monitor_id WHERE i.monitor_id IN (${ids.map(() => "?").join(",")}) ORDER BY i.started_at DESC LIMIT 20`).all(...ids)
      : [];
    res.json({ page, overall: overallStatus(monitors.map((m) => m.status)), components, incidents });
  });

  if (opts.serveStatic) {
    app.use(express.static(opts.serveStatic));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile("index.html", { root: opts.serveStatic }));
  }
  return app;
}
