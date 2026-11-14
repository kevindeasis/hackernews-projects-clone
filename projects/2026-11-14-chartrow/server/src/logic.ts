export interface PricePoint {
  date: string;
  close: number;
}

export interface DrawdownPoint extends PricePoint {
  peak: number;
  /** Fractional drawdown from the running peak, <= 0 (e.g. -0.25 = 25% below peak). */
  drawdown: number;
}

export interface MaxDrawdown {
  depth: number; // negative fraction
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
}

/** Running-peak drawdown ("underwater") series. Input must be sorted by date asc. */
export function drawdownSeries(prices: PricePoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return prices.map((p) => {
    peak = Math.max(peak, p.close);
    return { ...p, peak, drawdown: p.close / peak - 1 };
  });
}

/** Deepest peak-to-trough decline and when (if ever) the prior peak was regained. */
export function maxDrawdown(prices: PricePoint[]): MaxDrawdown | null {
  if (prices.length === 0) return null;
  let peakIdx = 0;
  let best = { depth: 0, peakIdx: 0, troughIdx: 0 };
  prices.forEach((p, i) => {
    if (p.close > prices[peakIdx].close) peakIdx = i;
    const dd = p.close / prices[peakIdx].close - 1;
    if (dd < best.depth) best = { depth: dd, peakIdx, troughIdx: i };
  });
  const peakPrice = prices[best.peakIdx].close;
  const rec = prices.findIndex((p, i) => i > best.troughIdx && p.close >= peakPrice);
  return {
    depth: best.depth,
    peakDate: prices[best.peakIdx].date,
    troughDate: prices[best.troughIdx].date,
    recoveryDate: rec === -1 ? null : prices[rec].date,
  };
}

/** Return over the last `days` calendar days ending at the last price (null if not enough history). */
export function periodReturn(prices: PricePoint[], days: number): number | null {
  if (prices.length < 2) return null;
  const last = prices[prices.length - 1];
  const cutoff = new Date(last.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  if (prices[0].date > iso) return null;
  let base = prices[0];
  for (const p of prices) {
    if (p.date <= iso) base = p;
    else break;
  }
  return last.close / base.close - 1;
}

export const PERIODS: Record<string, number> = { "1w": 7, "1m": 30, "3m": 91, "6m": 182, "1y": 365 };

/** Parse a `date,close` CSV (header optional, also accepts a 'Close'/'Adj Close' column in Yahoo-style exports). */
export function parsePriceCsv(text: string): PricePoint[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const split = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((c) => c.toLowerCase());
  let dateCol = 0;
  let closeCol = 1;
  let start = 0;
  if (!/^\d{4}-\d{2}-\d{2}/.test(head[0])) {
    start = 1;
    dateCol = Math.max(0, head.indexOf("date"));
    const adj = head.indexOf("adj close");
    closeCol = adj >= 0 ? adj : head.indexOf("close");
    if (closeCol < 0) throw new Error("CSV needs a 'close' column");
  }
  const out = new Map<string, number>();
  for (const line of lines.slice(start)) {
    const cols = split(line);
    const date = cols[dateCol]?.slice(0, 10);
    const close = Number(cols[closeCol]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(close) || close <= 0) {
      throw new Error(`Bad CSV row: ${line}`);
    }
    out.set(date, close);
  }
  return [...out].map(([date, close]) => ({ date, close })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Deterministic PRNG so seed data is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic geometric-random-walk prices over business days ending at `end`. */
export function syntheticPrices(seed: number, end: string, days: number, start: number, drift: number, vol: number): PricePoint[] {
  const rnd = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const dates: string[] = [];
  const d = new Date(end + "T00:00:00Z");
  while (dates.length < days) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  let price = start;
  return dates.map((date) => {
    price *= Math.exp(drift / 252 - (vol * vol) / 504 + (vol / Math.sqrt(252)) * normal());
    return { date, close: Math.round(price * 100) / 100 };
  });
}
