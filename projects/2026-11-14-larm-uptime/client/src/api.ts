export interface Monitor {
  id: number; name: string; type: "http" | "tcp" | "dns" | "heartbeat"; target: string; port: number | null;
  intervalSec: number; timeoutMs: number; expectedStatus: number | null; keyword: string | null;
  recordType: string | null; graceSec: number; failThreshold: number; paused: boolean;
  status: "pending" | "up" | "down"; lastCheckedAt: number | null; lastPingAt: number | null;
  heartbeatPath: string | null; createdAt: number; uptime24h?: number | null; p95?: number | null;
}
export interface Check {
  at: number; ok: number; latencyMs: number | null; statusCode: number | null; error: string | null;
  dnsMs: number | null; tcpMs: number | null; tlsMs: number | null; ttfbMs: number | null; transferMs: number | null;
}
export interface Incident { id: number; monitorId?: number; monitorName?: string; startedAt: number; resolvedAt: number | null; cause?: string | null }
export interface MonitorDetail {
  monitor: Monitor; range: string;
  stats: { uptime: number | null; p50: number | null; p95: number | null; p99: number | null; checks: number; certExpiresAt: number | null };
  checks: Check[]; incidents: Incident[];
}
export interface Channel { id: number; name: string; url: string }
export interface StatusPage { id: number; slug: string; title: string; description: string; monitorIds: number[] }
export interface PublicStatus {
  page: { slug: string; title: string; description: string };
  overall: "operational" | "degraded" | "outage" | "unknown";
  components: { id: number; name: string; status: Monitor["status"]; uptime90d: number | null; days: { date: string; uptime: number | null }[] }[];
  incidents: { id: number; monitorName: string; startedAt: number; resolvedAt: number | null }[];
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.json ? { "content-type": "application/json" } : undefined,
    body: init?.json ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? res.statusText));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const ms = (v: number | null | undefined) => (v == null ? "–" : v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);
export const ago = (t: number | null) => {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
