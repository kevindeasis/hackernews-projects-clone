export interface Client { id: number; name: string; archived: number }
export interface Project { id: number; client_id: number | null; name: string; rate_cents: number; color: string }
export interface Entry { id: number; project_id: number; description: string; started_at: string; ended_at: string | null; billable: number }
export interface HistoryItem { seq: number; tbl: string; rowId: number; label: string; undone: boolean; at: string }
export interface ReportLine { key: string; label: string; seconds: number; billableSeconds: number; amountCents: number }
export interface Report { lines: ReportLine[]; totalSeconds: number; totalCents: number; entries: number }

export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
export const fmtMoney = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
export const secondsOf = (e: Entry, now = Date.now()) =>
  Math.max(0, Math.round(((e.ended_at ? Date.parse(e.ended_at) : now) - Date.parse(e.started_at)) / 1000));
