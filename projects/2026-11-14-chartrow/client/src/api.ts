export interface Security { symbol: string; name: string; kind: "stock" | "etf"; sector: string; market_cap: number }
export interface DrawdownPoint { date: string; close: number; peak: number; drawdown: number }
export interface MaxDrawdown { depth: number; peakDate: string; troughDate: string; recoveryDate: string | null }
export interface HeatItem { symbol: string; name: string; sector: string; marketCap: number; ret: number }
export interface Holding { symbol: string; name: string; sector: string; weight: number; ret: number | null; contribution: number | null }

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

export const api = {
  securities: () => get<Security[]>("/api/securities"),
  drawdown: (symbol: string, range: string) =>
    get<{ security: Security; series: DrawdownPoint[]; max: MaxDrawdown | null }>(`/api/securities/${symbol}/drawdown?range=${range}`),
  heatmap: (period: string) => get<{ items: HeatItem[] }>(`/api/heatmap?period=${period}`),
  holdings: (etf: string, period: string) =>
    get<{ etf: Security; etfReturn: number | null; holdings: Holding[] }>(`/api/etfs/${etf}/holdings?period=${period}`),
  importCsv: async (symbol: string, csv: string) => {
    const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, csv }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    return body as { symbol: string; rows: number };
  },
};
