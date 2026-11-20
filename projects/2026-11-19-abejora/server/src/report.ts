import type { Row } from "./store.js";

export type GroupBy = "project" | "client" | "day";

export interface ReportLine {
  key: string;
  label: string;
  seconds: number;
  billableSeconds: number;
  amountCents: number;
}

export function entrySeconds(e: Row, now = Date.now()): number {
  const start = Date.parse(e.started_at as string);
  const end = e.ended_at ? Date.parse(e.ended_at as string) : now;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Aggregate entries into report lines, valuing billable time at the project's hourly rate. */
export function buildReport(entries: Row[], projects: Row[], clients: Row[], groupBy: GroupBy, now = Date.now()): ReportLine[] {
  const proj = new Map(projects.map((p) => [p.id as number, p]));
  const cli = new Map(clients.map((c) => [c.id as number, c]));
  const lines = new Map<string, ReportLine>();
  for (const e of entries) {
    const p = proj.get(e.project_id as number);
    const c = p?.client_id != null ? cli.get(p.client_id as number) : undefined;
    let key: string, label: string;
    if (groupBy === "day") key = label = (e.started_at as string).slice(0, 10);
    else if (groupBy === "client") { key = String(c?.id ?? 0); label = (c?.name as string) ?? "No client"; }
    else { key = String(p?.id ?? 0); label = (p?.name as string) ?? "Unknown project"; }
    const line = lines.get(key) ?? { key, label, seconds: 0, billableSeconds: 0, amountCents: 0 };
    const s = entrySeconds(e, now);
    line.seconds += s;
    if (e.billable) {
      line.billableSeconds += s;
      line.amountCents += Math.round((s / 3600) * ((p?.rate_cents as number) ?? 0));
    }
    lines.set(key, line);
  }
  return [...lines.values()].sort((a, b) => (groupBy === "day" ? a.key.localeCompare(b.key) : b.seconds - a.seconds));
}

export function toCsv(entries: Row[], projects: Row[]): string {
  const proj = new Map(projects.map((p) => [p.id as number, p.name as string]));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["project", "description", "started_at", "ended_at", "seconds", "billable"].join(",")];
  for (const e of entries)
    rows.push([proj.get(e.project_id as number), e.description, e.started_at, e.ended_at, entrySeconds(e), e.billable ? "yes" : "no"].map(esc).join(","));
  return rows.join("\n") + "\n";
}
