import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Severity } from "./api";

const MEALS = ["breakfast", "lunch", "dinner", "snack", "milk"];
const SEVERITIES: Severity[] = ["none", "mild", "moderate", "severe"];
const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries();
  const entries = useQuery({ queryKey: ["entries"], queryFn: api.entries });
  const foods = useQuery({ queryKey: ["foods"], queryFn: api.foods });
  const allergens = useQuery({ queryKey: ["allergens"], queryFn: api.allergens });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [tab, setTab] = useState<"diary" | "foods" | "allergens" | "report">("diary");
  const [form, setForm] = useState({ date: today(), meal: "lunch", food: "", reaction: "none" as Severity, notes: "" });
  const [report, setReport] = useState("");

  const add = useMutation({ mutationFn: api.add, onSuccess: () => { setForm({ ...form, food: "", notes: "", reaction: "none" }); refresh(); } });
  const react = useMutation({ mutationFn: (v: { id: number; r: Severity }) => api.setReaction(v.id, v.r), onSuccess: refresh });
  const del = useMutation({ mutationFn: api.remove, onSuccess: refresh });
  const name = useMutation({ mutationFn: api.saveSettings, onSuccess: refresh });

  const byDate = new Map<string, NonNullable<typeof entries.data>>();
  for (const e of entries.data ?? []) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <div className="wrap">
      <header>
        <h1>Niblet <small>weaning diary</small></h1>
        <input aria-label="Baby name" placeholder="Baby's name" defaultValue={settings.data?.babyName} key={settings.data?.babyName}
          onBlur={(e) => name.mutate(e.target.value)} />
      </header>
      <nav>
        {(["diary", "foods", "allergens", "report"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={async () => { setTab(t); if (t === "report") setReport(await api.report()); }}>{t}</button>
        ))}
      </nav>

      {tab === "diary" && (
        <>
          <form className="card" onSubmit={(e) => { e.preventDefault(); if (form.food.trim()) add.mutate(form); }}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <select value={form.meal} onChange={(e) => setForm({ ...form, meal: e.target.value })}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select>
            <input placeholder="Food (e.g. scrambled egg)" value={form.food} onChange={(e) => setForm({ ...form, food: e.target.value })} list="known" />
            <datalist id="known">{foods.data?.map((f) => <option key={f.food} value={f.food} />)}</datalist>
            <select value={form.reaction} onChange={(e) => setForm({ ...form, reaction: e.target.value as Severity })}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
            <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button type="submit">Log</button>
          </form>
          {[...byDate].map(([d, es]) => (
            <section key={d} className="card">
              <h3>{d}</h3>
              <ul>
                {es.map((e) => (
                  <li key={e.id}>
                    <span className="meal">{e.meal}</span> <strong>{e.food}</strong>
                    {e.allergen && <span className="tag">{e.allergen}</span>}
                    {e.notes && <em> {e.notes}</em>}
                    <select className={`sev ${e.reaction}`} value={e.reaction} onChange={(ev) => react.mutate({ id: e.id, r: ev.target.value as Severity })}>
                      {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button className="x" onClick={() => del.mutate(e.id)} aria-label="Delete">×</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!entries.data?.length && <p className="muted">Nothing logged yet. Add the first food above.</p>}
        </>
      )}

      {tab === "foods" && (
        <table className="card">
          <thead><tr><th>Food</th><th>Eaten</th><th>First</th><th>Reactions</th><th>Worst</th><th></th></tr></thead>
          <tbody>
            {foods.data?.map((f) => (
              <tr key={f.food} className={f.suspect ? "suspect" : ""}>
                <td>{f.food}</td><td>{f.timesEaten}×</td><td>{f.firstTried}</td>
                <td>{f.reactions} ({Math.round(f.reactionRate * 100)}%)</td><td>{f.worstReaction}</td><td>{f.suspect ? "⚠ suspect" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "allergens" && (
        <div className="grid">
          {allergens.data?.map((a) => (
            <div key={a.allergen} className={`card ${a.introduced ? (a.reactions ? "warn" : "ok") : ""}`}>
              <h3>{a.allergen}</h3>
              {a.introduced ? <p>First tried {a.firstTried}<br />{a.timesEaten}× eaten, {a.reactions} reaction(s)</p> : <p className="muted">Not yet introduced</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "report" && (
        <div className="card">
          <p className="muted">A plain-text summary to share with your GP.</p>
          <pre>{report}</pre>
          <button onClick={() => navigator.clipboard?.writeText(report)}>Copy</button>
        </div>
      )}
    </div>
  );
}
