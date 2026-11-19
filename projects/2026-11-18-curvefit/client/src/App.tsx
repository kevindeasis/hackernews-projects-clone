import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ComposedChart,
} from "recharts";
import { api, type ExerciseDetail, type Prescription, type Settings } from "./api";

type View = { name: "plan" } | { name: "exercise"; id: number } | { name: "settings" };

export function App() {
  const [view, setView] = useState<View>({ name: "plan" });
  return (
    <div className="app">
      <header>
        <h1 onClick={() => setView({ name: "plan" })}>CurveFit</h1>
        <nav>
          <button className={view.name === "plan" ? "on" : ""} onClick={() => setView({ name: "plan" })}>Today</button>
          <button className={view.name === "settings" ? "on" : ""} onClick={() => setView({ name: "settings" })}>Settings</button>
        </nav>
      </header>
      <main>
        {view.name === "plan" && <Plan open={(id) => setView({ name: "exercise", id })} />}
        {view.name === "exercise" && <Exercise id={view.id} back={() => setView({ name: "plan" })} />}
        {view.name === "settings" && <SettingsForm />}
      </main>
    </div>
  );
}

function Plan({ open }: { open: (id: number) => void }) {
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ["plan"], queryFn: api.plan });
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => api.addExercise(name),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["plan"] }); },
  });
  const unit = plan.data?.settings.unit ?? "kg";
  return (
    <>
      <p className="lede">
        Log sets and CurveFit fits your strength curve, then prescribes heavy, medium and light work along it.
      </p>
      <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input placeholder="Add exercise (e.g. Back squat)" value={name} onChange={(e) => setName(e.target.value)} />
        <button>Add</button>
      </form>
      {add.error && <p className="error">{(add.error as Error).message}</p>}
      {plan.data?.exercises.length === 0 && <p className="muted">No exercises yet — add one above, then log a few sets.</p>}
      <div className="cards">
        {plan.data?.exercises.map((ex) => (
          <article key={ex.id} className="card" onClick={() => open(ex.id)}>
            <h3>{ex.name}</h3>
            {ex.fit ? (
              <>
                <p className="muted">Est. 1RM {ex.fit.e1rm} {unit} · last trained {ex.lastDate}</p>
                <PrescriptionTable rows={ex.prescription} unit={unit} />
              </>
            ) : (
              <p className="muted">No sets logged yet.</p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function PrescriptionTable({ rows, unit }: { rows: Prescription[]; unit: string }) {
  return (
    <table className="presc">
      <tbody>
        {rows.map((p) => (
          <tr key={p.label}>
            <th>{p.label}</th>
            <td><b>{p.weight} {unit}</b> × {p.reps}</td>
            <td className="muted">{p.percent}% 1RM</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Exercise({ id, back }: { id: number; back: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["exercise", id], queryFn: () => api.exercise(id) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["exercise", id] }); qc.invalidateQueries({ queryKey: ["plan"] }); };
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");
  const log = useMutation({
    mutationFn: () => api.addSet(id, { weight: Number(weight), reps: Number(reps), rpe: rpe ? Number(rpe) : null }),
    onSuccess: () => { setReps(""); setRpe(""); refresh(); },
  });
  const delSet = useMutation({ mutationFn: api.deleteSet, onSuccess: refresh });
  const delEx = useMutation({
    mutationFn: () => api.deleteExercise(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plan"] }); back(); },
  });
  if (!q.data) return <p className="muted">Loading…</p>;
  const d = q.data;
  const unit = d.settings.unit;
  return (
    <>
      <button className="link" onClick={back}>← All exercises</button>
      <h2>{d.exercise.name}</h2>
      {d.fit && (
        <p className="muted">
          Est. 1RM <b>{d.fit.e1rm} {unit}</b> · curve steepness k = {d.fit.k} · fitted from {d.fit.points} frontier set{d.fit.points === 1 ? "" : "s"}
          {d.fit.points < 3 && " (log sets at different rep ranges to sharpen the curve)"}
        </p>
      )}
      <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); log.mutate(); }}>
        <input type="number" step="any" min="0" placeholder={`Weight (${unit})`} value={weight} onChange={(e) => setWeight(e.target.value)} required />
        <input type="number" min="1" step="1" placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value)} required />
        <input type="number" min="1" max="10" step="0.5" placeholder="RPE (opt.)" value={rpe} onChange={(e) => setRpe(e.target.value)} />
        <button>Log set</button>
      </form>
      {log.error && <p className="error">{(log.error as Error).message}</p>}
      {d.fit && (
        <>
          <h3>Next session</h3>
          <PrescriptionTable rows={d.prescription} unit={unit} />
          <h3>Strength curve</h3>
          <CurveChart d={d} />
          {d.e1rmHistory.length > 1 && (
            <>
              <h3>Estimated 1RM over time</h3>
              <div className="chart">
                <ResponsiveContainer>
                  <LineChart data={d.e1rmHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={["auto", "auto"]} unit={` ${unit}`} width={70} />
                    <Tooltip />
                    <Line dataKey="e1rm" stroke="#2563eb" dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
      <h3>History</h3>
      <table className="history">
        <thead><tr><th>Date</th><th>Weight</th><th>Reps</th><th>RPE</th><th /></tr></thead>
        <tbody>
          {[...d.sets].reverse().map((s) => (
            <tr key={s.id} className={s.onFrontier ? "frontier" : ""}>
              <td>{s.date}</td><td>{s.weight} {unit}</td><td>{s.reps}</td><td>{s.rpe ?? "–"}</td>
              <td><button className="link" onClick={() => delSet.mutate(s.id)}>delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Highlighted rows are on your frontier — the sets that shape the curve.</p>
      <button className="danger" onClick={() => confirm("Delete this exercise and all its sets?") && delEx.mutate()}>Delete exercise</button>
    </>
  );
}

function CurveChart({ d }: { d: ExerciseDetail }) {
  const frontierPts = d.sets.filter((s) => s.onFrontier).map((s) => ({ reps: s.reps, weight: s.weight }));
  const otherPts = d.sets.filter((s) => !s.onFrontier).map((s) => ({ reps: s.reps, weight: s.weight }));
  const presc = d.prescription.map((p) => ({ reps: p.reps, weight: p.weight }));
  return (
    <div className="chart">
      <ResponsiveContainer>
        <ComposedChart data={d.curve}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="reps" type="number" domain={[1, 20]} label={{ value: "reps", position: "insideBottom", offset: -2 }} />
          <YAxis type="number" domain={["auto", "auto"]} unit={` ${d.settings.unit}`} width={70} />
          <Tooltip />
          <Legend verticalAlign="top" />
          <Line name="Fitted curve" dataKey="weight" stroke="#2563eb" dot={false} strokeWidth={2} />
          <Scatter name="Frontier sets" data={frontierPts} dataKey="weight" fill="#16a34a" />
          <Scatter name="Other sets" data={otherPts} dataKey="weight" fill="#9ca3af" />
          <Scatter name="Prescribed" data={presc} dataKey="weight" fill="#f97316" shape="diamond" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SettingsForm() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [draft, setDraft] = useState<Settings | null>(null);
  const save = useMutation({
    mutationFn: (s: Settings) => api.saveSettings(s),
    onSuccess: () => { qc.invalidateQueries(); setDraft(null); },
  });
  const s = draft ?? q.data;
  if (!s) return null;
  return (
    <form className="settings" onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
      <label>Unit
        <select value={s.unit} onChange={(e) => setDraft({ ...s, unit: e.target.value as Settings["unit"] })}>
          <option value="kg">kg</option><option value="lb">lb</option>
        </select>
      </label>
      <label>Smallest plate jump
        <input type="number" step="any" min="0.25" value={s.increment} onChange={(e) => setDraft({ ...s, increment: Number(e.target.value) })} />
      </label>
      <label>Reps left in reserve
        <input type="number" min="0" max="5" value={s.rir} onChange={(e) => setDraft({ ...s, rir: Number(e.target.value) })} />
      </label>
      <button>Save</button>
      {save.isSuccess && !draft && <span className="muted"> Saved.</span>}
    </form>
  );
}
