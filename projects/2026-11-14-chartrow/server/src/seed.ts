import type { Db } from "./db.js";
import { syntheticPrices } from "./logic.js";

// Fictional-but-plausible universe. Prices are SYNTHETIC (seeded random walks) so the
// app runs offline; use the CSV import to load real history.
const STOCKS: [string, string, string, number, number, number][] = [
  // symbol, name, sector, market cap ($B), drift, vol
  ["AAPL", "Apple", "Technology", 3000, 0.14, 0.26],
  ["MSFT", "Microsoft", "Technology", 3100, 0.16, 0.24],
  ["NVDA", "NVIDIA", "Technology", 3300, 0.35, 0.50],
  ["GOOG", "Alphabet", "Communication", 2000, 0.12, 0.28],
  ["AMZN", "Amazon", "Consumer", 1900, 0.15, 0.32],
  ["META", "Meta Platforms", "Communication", 1400, 0.2, 0.38],
  ["TSLA", "Tesla", "Consumer", 900, 0.1, 0.62],
  ["JPM", "JPMorgan Chase", "Financials", 600, 0.1, 0.22],
  ["V", "Visa", "Financials", 550, 0.11, 0.2],
  ["XOM", "Exxon Mobil", "Energy", 480, 0.06, 0.25],
  ["UNH", "UnitedHealth", "Healthcare", 480, 0.05, 0.27],
  ["LLY", "Eli Lilly", "Healthcare", 700, 0.25, 0.33],
  ["WMT", "Walmart", "Consumer", 600, 0.1, 0.18],
  ["PG", "Procter & Gamble", "Staples", 400, 0.05, 0.16],
  ["KO", "Coca-Cola", "Staples", 290, 0.05, 0.15],
  ["CVX", "Chevron", "Energy", 280, 0.05, 0.24],
  ["NFLX", "Netflix", "Communication", 400, 0.18, 0.4],
  ["AMD", "AMD", "Technology", 250, 0.15, 0.5],
  ["BA", "Boeing", "Industrials", 120, -0.02, 0.35],
  ["CAT", "Caterpillar", "Industrials", 180, 0.12, 0.25],
  ["DIS", "Disney", "Communication", 190, 0.02, 0.28],
  ["PFE", "Pfizer", "Healthcare", 150, -0.03, 0.22],
  ["INTC", "Intel", "Technology", 110, -0.08, 0.38],
  ["COST", "Costco", "Staples", 380, 0.15, 0.2],
];

const ETFS: [string, string, string[]][] = [
  ["TECHX", "Chartrow Tech ETF", ["AAPL", "MSFT", "NVDA", "AMD", "INTC", "GOOG", "META"]],
  ["BIG10", "Chartrow Megacap 10 ETF", ["AAPL", "MSFT", "NVDA", "GOOG", "AMZN", "META", "TSLA", "JPM", "V", "LLY"]],
  ["DEFNS", "Chartrow Defensive ETF", ["PG", "KO", "WMT", "COST", "UNH", "PFE", "XOM", "CVX"]],
];

export function seed(db: Db, end = new Date().toISOString().slice(0, 10)): void {
  const insSec = db.prepare("INSERT INTO securities (symbol,name,kind,sector,market_cap) VALUES (?,?,?,?,?)");
  const insPrice = db.prepare("INSERT INTO prices (symbol,date,close) VALUES (?,?,?)");
  const insHold = db.prepare("INSERT INTO holdings (etf,symbol,weight) VALUES (?,?,?)");
  const caps = new Map(STOCKS.map((s) => [s[0], s[3]]));

  db.transaction(() => {
    STOCKS.forEach(([sym, name, sector, cap, drift, vol], i) => {
      insSec.run(sym, name, "stock", sector, cap);
      for (const p of syntheticPrices(1000 + i, end, 756, 50 + i * 7, drift, vol)) insPrice.run(sym, p.date, p.close);
    });
    ETFS.forEach(([sym, name, members], i) => {
      const total = members.reduce((a, m) => a + (caps.get(m) ?? 0), 0);
      insSec.run(sym, name, "etf", "ETF", total);
      for (const p of syntheticPrices(5000 + i, end, 756, 100, 0.1, 0.18)) insPrice.run(sym, p.date, p.close);
      for (const m of members) insHold.run(sym, m, (caps.get(m) ?? 0) / total);
    });
  })();
}
