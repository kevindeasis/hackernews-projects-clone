import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from "recharts";
import { api } from "./api";

const pct = (n: number | null | undefined, d = 1) => (n == null ? "–" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%`);

/** Red → grey → green, saturating at ±15%. */
function heatColor(ret: number): string {
  const t = Math.max(-1, Math.min(1, ret / 0.15));
  const hue = t >= 0 ? 140 : 0;
  const sat = 55 * Math.abs(t) + 5;
  return `hsl(${hue} ${sat}% ${30 - 5 * Math.abs(t) + 8}%)`;
}

function Drawdown() {
  const [symbol, setSymbol] = useState("NVDA");
  const [range, setRange] = useState("1y");
  const secs = useQuery({ queryKey: ["securities"], queryFn: api.securities });
  const dd = useQuery({ queryKey: ["dd", symbol, range], queryFn: () => api.drawdown(symbol, range) });
  const m = dd.data?.max;
  return (
    <section>
      <div className="controls">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {secs.data?.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} – {s.name}</option>)}
        </select>
        {["3m", "6m", "1y", "3y", "max"].map((r) => (
          <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>
      {m && (
        <p className="stat">
          Max drawdown <b className="neg">{pct(m.depth)}</b> · peak {m.peakDate} → trough {m.troughDate} ·{" "}
          {m.recoveryDate ? `recovered ${m.recoveryDate}` : "not yet recovered"}
        </p>
      )}
      <h3>Price vs. running peak</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={dd.data?.series}>
          <CartesianGrid stroke="#2a2f3a" />
          <XAxis dataKey="date" minTickGap={60} stroke="#8b93a5" />
          <YAxis domain={["auto", "auto"]} stroke="#8b93a5" />
          <Tooltip contentStyle={{ background: "#161a22", border: "1px solid #2a2f3a" }} />
          <Line dataKey="close" stroke="#6ea8fe" dot={false} strokeWidth={1.5} />
          <Line dataKey="peak" stroke="#8b93a5" dot={false} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
      <h3>Drawdown (underwater)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={dd.data?.series}>
          <CartesianGrid stroke="#2a2f3a" />
          <XAxis dataKey="date" minTickGap={60} stroke="#8b93a5" />
          <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke="#8b93a5" />
          <Tooltip formatter={(v: number) => pct(v)} contentStyle={{ background: "#161a22", border: "1px solid #2a2f3a" }} />
          <Area dataKey="drawdown" stroke="#f26d6d" fill="#f26d6d55" />
        </AreaChart>
      </ResponsiveContainer>
      <ImportBox onDone={(s) => setSymbol(s)} />
    </section>
  );
}

function ImportBox({ onDone }: { onDone: (s: string) => void }) {
  const qc = useQueryClient();
  const [sym, setSym] = useState("");
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <details className="import">
      <summary>Import real prices (CSV)</summary>
      <p className="muted">Paste <code>date,close</code> rows or a Yahoo-style export (Date, Close / Adj Close).</p>
      <input placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value)} />
      <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"date,close\n2024-01-02,185.6"} />
      <button
        onClick={async () => {
          try {
            const r = await api.importCsv(sym, csv);
            setMsg(`Imported ${r.rows} rows for ${r.symbol}`);
            qc.invalidateQueries();
            onDone(r.symbol);
          } catch (e) { setMsg((e as Error).message); }
        }}
      >Import</button>
      <span className="muted"> {msg}</span>
    </details>
  );
}

// Recharts clones this element with layout props (x, y, width, height) plus our data fields.
function HeatCell(props: any) {
  const { x, y, width, height, name, ret } = props;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={heatColor(ret ?? 0)} stroke="#0f1218" />
      {width > 44 && height > 32 && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={12}>
          <tspan x={x + width / 2} dy="-0.2em" fontWeight={700}>{name}</tspan>
          <tspan x={x + width / 2} dy="1.3em">{pct(ret)}</tspan>
        </text>
      )}
    </g>
  );
}

function Heatmap() {
  const [period, setPeriod] = useState("1m");
  const q = useQuery({ queryKey: ["heat", period], queryFn: () => api.heatmap(period) });
  const sorted = [...(q.data?.items ?? [])].sort((a, b) => b.ret - a.ret);
  const data = (q.data?.items ?? []).map((i) => ({ name: i.symbol, size: i.marketCap, ret: i.ret }));
  return (
    <section>
      <div className="controls">
        {["1w", "1m", "3m", "6m", "1y"].map((p) => (
          <button key={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{p}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <Treemap
          data={data}
          dataKey="size"
          stroke="#0f1218"
          isAnimationActive={false}
          content={<HeatCell />}
        />
      </ResponsiveContainer>
      <div className="two">
        <div>
          <h3>Top performers</h3>
          <Rank rows={sorted.slice(0, 5)} />
        </div>
        <div>
          <h3>Worst performers</h3>
          <Rank rows={sorted.slice(-5).reverse()} />
        </div>
      </div>
    </section>
  );
}

function Rank({ rows }: { rows: { symbol: string; name: string; ret: number }[] }) {
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}><td>{r.symbol}</td><td className="muted">{r.name}</td><td className={r.ret >= 0 ? "pos" : "neg"}>{pct(r.ret)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Etf() {
  const secs = useQuery({ queryKey: ["securities"], queryFn: api.securities });
  const etfs = secs.data?.filter((s) => s.kind === "etf") ?? [];
  const [etf, setEtf] = useState("TECHX");
  const [period, setPeriod] = useState("3m");
  const q = useQuery({ queryKey: ["etf", etf, period], queryFn: () => api.holdings(etf, period) });
  return (
    <section>
      <div className="controls">
        <select value={etf} onChange={(e) => setEtf(e.target.value)}>
          {etfs.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} – {s.name}</option>)}
        </select>
        {["1m", "3m", "6m", "1y"].map((p) => (
          <button key={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{p}</button>
        ))}
      </div>
      <p className="stat">ETF return over {period}: <b className={(q.data?.etfReturn ?? 0) >= 0 ? "pos" : "neg"}>{pct(q.data?.etfReturn)}</b></p>
      <table className="full">
        <thead><tr><th>Symbol</th><th>Name</th><th>Sector</th><th>Weight</th><th>Return</th><th>Contribution</th></tr></thead>
        <tbody>
          {q.data?.holdings.map((h) => (
            <tr key={h.symbol}>
              <td>{h.symbol}</td><td>{h.name}</td><td className="muted">{h.sector}</td>
              <td><span className="bar" style={{ width: `${h.weight * 200}px` }} /> {(h.weight * 100).toFixed(1)}%</td>
              <td className={(h.ret ?? 0) >= 0 ? "pos" : "neg"}>{pct(h.ret)}</td>
              <td className={(h.contribution ?? 0) >= 0 ? "pos" : "neg"}>{pct(h.contribution, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const TABS = { Drawdowns: Drawdown, Heatmap, "ETF holdings": Etf } as const;

export default function App() {
  const [tab, setTab] = useState<keyof typeof TABS>("Drawdowns");
  const View = TABS[tab];
  return (
    <div className="app">
      <header>
        <h1>Chartrow</h1>
        <nav>{(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}</nav>
      </header>
      <View />
      <footer className="muted">Seed prices are synthetic demo data — import real CSVs for real charts. Not investment advice.</footer>
    </div>
  );
}
