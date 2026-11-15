/** Pure helpers: state machine, percentiles, uptime and heartbeat evaluation. */

export type Status = "pending" | "up" | "down";

export interface Transition {
  status: Status;
  consecutiveFailures: number;
  /** "opened" when an incident should start, "resolved" when it should close. */
  incident: "opened" | "resolved" | null;
}

/**
 * Apply one check result to a monitor's state.
 * A monitor goes down only after `threshold` consecutive failures (this
 * de-duplicates flapping; Larm does it with multi-location majority voting,
 * this clone uses consecutive failures from a single probe).
 */
export function applyResult(
  prev: { status: Status; consecutiveFailures: number },
  ok: boolean,
  threshold: number,
): Transition {
  if (ok) {
    return {
      status: "up",
      consecutiveFailures: 0,
      incident: prev.status === "down" ? "resolved" : null,
    };
  }
  const failures = prev.consecutiveFailures + 1;
  if (prev.status === "down") return { status: "down", consecutiveFailures: failures, incident: null };
  if (failures >= threshold) return { status: "down", consecutiveFailures: failures, incident: "opened" };
  return { status: prev.status, consecutiveFailures: failures, incident: null };
}

/** Linear-interpolated percentile (p in 0..100). Returns null for no data. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Uptime percentage over a list of checks, or null if there are none. */
export function uptimePct(checks: { ok: number | boolean }[]): number | null {
  if (checks.length === 0) return null;
  const up = checks.filter((c) => c.ok).length;
  return Math.round((up / checks.length) * 10000) / 100;
}

/**
 * A heartbeat is overdue when no ping arrived within interval + grace.
 * Monitors that never received a ping are measured from creation time.
 */
export function heartbeatOverdue(opts: {
  now: number;
  lastPingAt: number | null;
  createdAt: number;
  intervalSec: number;
  graceSec: number;
}): boolean {
  const reference = opts.lastPingAt ?? opts.createdAt;
  return opts.now - reference > (opts.intervalSec + opts.graceSec) * 1000;
}

/** Overall banner for a status page. */
export function overallStatus(statuses: Status[]): "operational" | "degraded" | "outage" | "unknown" {
  if (statuses.length === 0 || statuses.every((s) => s === "pending")) return "unknown";
  const down = statuses.filter((s) => s === "down").length;
  if (down === 0) return "operational";
  return down === statuses.length ? "outage" : "degraded";
}
