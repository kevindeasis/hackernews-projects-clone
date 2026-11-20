import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtDuration, secondsOf, type Entry, type Project } from "./api";

const toLocalInput = (iso: string) => new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => new Date(v).toISOString();

export default function Tracker() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const entries = useQuery({ queryKey: ["entries"], queryFn: () => api<Entry[]>("/entries") });
  const [projectId, setProjectId] = useState<number | "">("");
  const [desc, setDesc] = useState("");
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const refresh = () => qc.invalidateQueries();
  const name = (id: number) => projects.data?.find((p) => p.id === id);
  const running = entries.data?.find((e) => !e.ended_at);

  const start = async () => {
    if (projectId === "") return;
    await api("/timer/start", "POST", { project_id: projectId, description: desc });
    setDesc(""); refresh();
  };
  const patch = async (id: number, body: Partial<Omit<Entry, "billable">> & { billable?: boolean }) => { await api(`/entries/${id}`, "PATCH", body); refresh(); };

  const days = new Map<string, Entry[]>();
  for (const e of entries.data ?? []) {
    const d = new Date(e.started_at).toLocaleDateString();
    days.set(d, [...(days.get(d) ?? []), e]);
  }

  return (
    <section>
      <div className="timer">
        <input placeholder="What are you working on?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Project…</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {running ? (
          <button className="stop" onClick={async () => { await api("/timer/stop", "POST"); refresh(); }}>■ {fmtDuration(secondsOf(running, now))}</button>
        ) : (
          <button className="go" disabled={projectId === ""} onClick={start}>▶ Start</button>
        )}
      </div>
      {projects.data?.length === 0 && <p className="muted">Create a project in the Projects tab first.</p>}
      {[...days].map(([day, list]) => (
        <div key={day} className="day">
          <h3>{day} <small>{fmtDuration(list.reduce((a, e) => a + secondsOf(e, now), 0))}</small></h3>
          {list.map((e) => {
            const p = name(e.project_id);
            return (
              <div key={e.id} className="entry">
                <span className="dot" style={{ background: p?.color }} />
                {editing === e.id ? (
                  <>
                    <input defaultValue={e.description} onBlur={(ev) => patch(e.id, { description: ev.target.value })} />
                    <input type="datetime-local" defaultValue={toLocalInput(e.started_at)} onBlur={(ev) => ev.target.value && patch(e.id, { started_at: fromLocalInput(ev.target.value) })} />
                    {e.ended_at && <input type="datetime-local" defaultValue={toLocalInput(e.ended_at)} onBlur={(ev) => ev.target.value && patch(e.id, { ended_at: fromLocalInput(ev.target.value) })} />}
                    <button onClick={() => setEditing(null)}>Done</button>
                  </>
                ) : (
                  <>
                    <span className="grow">{e.description || <em className="muted">(no description)</em>} <small className="muted">· {p?.name}</small></span>
                    <label title="Billable"><input type="checkbox" checked={!!e.billable} onChange={(ev) => patch(e.id, { billable: ev.target.checked })} /> $</label>
                    <span className="mono">{fmtDuration(secondsOf(e, now))}</span>
                    <button onClick={() => setEditing(e.id)}>Edit</button>
                    <button onClick={async () => { await api(`/entries/${e.id}`, "DELETE"); refresh(); }}>✕</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
