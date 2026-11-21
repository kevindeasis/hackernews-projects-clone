import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJourneys, fetchStations, type Journey } from "./api";

const fmt = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export function App() {
  const stations = useQuery({ queryKey: ["stations"], queryFn: fetchStations });
  const [from, setFrom] = useState("KGX");
  const [to, setTo] = useState("MAN");
  const [depart, setDepart] = useState("08:00");
  const [maxChanges, setMaxChanges] = useState(3);
  const [params, setParams] = useState<{ from: string; to: string; depart: string; maxChanges: number } | null>(null);
  const results = useQuery({ queryKey: ["journeys", params], queryFn: () => fetchJourneys(params!), enabled: !!params });

  return (
    <main>
      <h1>Rail Raptor</h1>
      <p className="sub">Journey planner running the RAPTOR algorithm. Finds every fastest option for each number of changes, including routes via walking transfers.</p>
      <form onSubmit={(e) => { e.preventDefault(); setParams({ from, to, depart, maxChanges }); }}>
        <label>From
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="button" className="swap" aria-label="Swap" onClick={() => { setFrom(to); setTo(from); }}>⇄</button>
        <label>To
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Depart after
          <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} required />
        </label>
        <label>Max changes
          <select value={maxChanges} onChange={(e) => setMaxChanges(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="submit" className="go">Search</button>
      </form>

      {results.isFetching && <p>Searching…</p>}
      {results.error && <p className="err">{(results.error as Error).message}</p>}
      {results.data && results.data.length === 0 && <p>No journeys found. Try a later time or allow more changes.</p>}
      {results.data?.map((j, i) => <JourneyCard key={i} j={j} />)}
    </main>
  );
}

function JourneyCard({ j }: { j: Journey }) {
  return (
    <section className="card">
      <header>
        <strong>{j.depLabel} → {j.arrLabel}</strong>
        <span>{fmt(j.duration)} · {j.changes === 0 ? "direct" : `${j.changes} change${j.changes > 1 ? "s" : ""}`}</span>
      </header>
      <ol>
        {j.legs.map((l, i) => (
          <li key={i} className={l.mode}>
            <span className="t">{l.depLabel}</span> {l.fromName}
            <div className="meta">
              {l.mode === "walk"
                ? `Walk to ${l.toName}`
                : `${l.routeName} (${l.operator}) to ${l.toName}, arr ${l.arrLabel}${l.stopsPassed?.length ? ` · via ${l.stopsPassed.join(", ")}` : ""}`}
            </div>
          </li>
        ))}
        <li className="end"><span className="t">{j.arrLabel}</span> {j.legs[j.legs.length - 1].toName}</li>
      </ol>
    </section>
  );
}
