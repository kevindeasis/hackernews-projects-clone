import type { Db } from "./db.js";
import { checkDns, checkHttp, checkTcp, type CheckResult } from "./checkers.js";
import { applyResult, heartbeatOverdue, type Status } from "./logic.js";
import { dispatchAlert, type Sender } from "./alerts.js";

export interface MonitorRow {
  id: number;
  name: string;
  type: "http" | "tcp" | "dns" | "heartbeat";
  target: string;
  port: number | null;
  interval_sec: number;
  timeout_ms: number;
  expected_status: number | null;
  keyword: string | null;
  record_type: string | null;
  heartbeat_token: string | null;
  grace_sec: number;
  fail_threshold: number;
  paused: number;
  status: Status;
  consecutive_failures: number;
  last_checked_at: number | null;
  last_ping_at: number | null;
  created_at: number;
}

export async function probe(m: MonitorRow, now = Date.now()): Promise<CheckResult> {
  switch (m.type) {
    case "http":
      return checkHttp({ url: m.target, timeoutMs: m.timeout_ms, expectedStatus: m.expected_status, keyword: m.keyword });
    case "tcp":
      return checkTcp(m.target, m.port ?? 80, m.timeout_ms);
    case "dns":
      return checkDns(m.target, m.record_type ?? "A", m.timeout_ms);
    case "heartbeat": {
      const overdue = heartbeatOverdue({
        now,
        lastPingAt: m.last_ping_at,
        createdAt: m.created_at,
        intervalSec: m.interval_sec,
        graceSec: m.grace_sec,
      });
      return overdue
        ? { ok: false, latencyMs: null, error: "No heartbeat received within the expected window" }
        : { ok: true, latencyMs: null };
    }
  }
}

/** Run one check for a monitor, store it, update state, open/close incidents, send alerts. */
export async function runCheck(db: Db, id: number, send?: Sender, result?: CheckResult, now = Date.now()) {
  const m = db.prepare("SELECT * FROM monitors WHERE id = ?").get(id) as MonitorRow | undefined;
  if (!m) return null;
  const r = result ?? (await probe(m, now));

  db.prepare(
    `INSERT INTO checks (monitor_id, at, ok, latency_ms, status_code, error, dns_ms, tcp_ms, tls_ms, ttfb_ms, transfer_ms, cert_expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, now, r.ok ? 1 : 0, r.latencyMs ?? null, r.statusCode ?? null, r.error ?? null,
    r.dnsMs ?? null, r.tcpMs ?? null, r.tlsMs ?? null, r.ttfbMs ?? null, r.transferMs ?? null, r.certExpiresAt ?? null,
  );

  const t = applyResult({ status: m.status, consecutiveFailures: m.consecutive_failures }, r.ok, m.fail_threshold);
  db.prepare("UPDATE monitors SET status=?, consecutive_failures=?, last_checked_at=? WHERE id=?").run(
    t.status, t.consecutiveFailures, now, id,
  );

  if (t.incident === "opened") {
    db.prepare("INSERT INTO incidents (monitor_id, started_at, cause) VALUES (?,?,?)").run(id, now, r.error ?? null);
    await dispatchAlert(db, { kind: "down", monitorName: m.name, target: describeTarget(m), cause: r.error, at: now }, send);
  } else if (t.incident === "resolved") {
    db.prepare("UPDATE incidents SET resolved_at=? WHERE monitor_id=? AND resolved_at IS NULL").run(now, id);
    await dispatchAlert(db, { kind: "recovered", monitorName: m.name, target: describeTarget(m), at: now }, send);
  }
  return { result: r, transition: t };
}

export function describeTarget(m: Pick<MonitorRow, "type" | "target" | "port">): string {
  if (m.type === "tcp") return `${m.target}:${m.port}`;
  if (m.type === "heartbeat") return "heartbeat";
  return m.target;
}

/** Simple in-process scheduler: every second, run whichever monitors are due. */
export function startScheduler(db: Db, send?: Sender) {
  const running = new Set<number>();
  const tick = () => {
    const now = Date.now();
    const due = db
      .prepare("SELECT id, interval_sec, last_checked_at FROM monitors WHERE paused = 0")
      .all() as { id: number; interval_sec: number; last_checked_at: number | null }[];
    for (const m of due) {
      if (running.has(m.id)) continue;
      if (m.last_checked_at && now - m.last_checked_at < m.interval_sec * 1000) continue;
      running.add(m.id);
      runCheck(db, m.id, send)
        .catch((e) => console.error(`[scheduler] monitor ${m.id}:`, e))
        .finally(() => running.delete(m.id));
    }
  };
  const handle = setInterval(tick, 1000);
  tick();
  return () => clearInterval(handle);
}

/** Delete checks older than `days` (Larm free tier keeps 90 days). */
export function pruneChecks(db: Db, days = 90, now = Date.now()) {
  return db.prepare("DELETE FROM checks WHERE at < ?").run(now - days * 86_400_000).changes;
}
