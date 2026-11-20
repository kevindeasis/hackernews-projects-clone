import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, type Client, type Project } from "./api";

export default function Projects() {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const [cname, setCname] = useState("");
  const [pname, setPname] = useState("");
  const [rate, setRate] = useState("");
  const [cid, setCid] = useState<number | "">("");
  const refresh = () => qc.invalidateQueries();

  return (
    <section className="cols">
      <div>
        <h2>Clients</h2>
        <form onSubmit={async (e) => { e.preventDefault(); if (!cname.trim()) return; await api("/clients", "POST", { name: cname.trim() }); setCname(""); refresh(); }}>
          <input placeholder="New client" value={cname} onChange={(e) => setCname(e.target.value)} />
          <button>Add</button>
        </form>
        {clients.data?.map((c) => (
          <div key={c.id} className="entry">
            <input className="grow" defaultValue={c.name} onBlur={async (e) => { if (e.target.value && e.target.value !== c.name) { await api(`/clients/${c.id}`, "PATCH", { name: e.target.value }); refresh(); } }} />
            <button onClick={async () => { await api(`/clients/${c.id}`, "DELETE"); refresh(); }}>✕</button>
          </div>
        ))}
      </div>
      <div>
        <h2>Projects</h2>
        <form onSubmit={async (e) => {
          e.preventDefault(); if (!pname.trim()) return;
          await api("/projects", "POST", { name: pname.trim(), client_id: cid === "" ? null : cid, rate_cents: Math.round(Number(rate || 0) * 100), color: `hsl(${Math.floor(Math.random() * 360)} 70% 55%)` });
          setPname(""); setRate(""); refresh();
        }}>
          <input placeholder="New project" value={pname} onChange={(e) => setPname(e.target.value)} />
          <select value={cid} onChange={(e) => setCid(e.target.value ? Number(e.target.value) : "")}>
            <option value="">No client</option>
            {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" min="0" placeholder="$/hour" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 90 }} />
          <button>Add</button>
        </form>
        {projects.data?.map((p) => (
          <div key={p.id} className="entry">
            <span className="dot" style={{ background: p.color }} />
            <span className="grow">{p.name} <small className="muted">· {clients.data?.find((c) => c.id === p.client_id)?.name ?? "no client"} · {fmtMoney(p.rate_cents)}/h</small></span>
            <button onClick={async () => { await api(`/projects/${p.id}`, "DELETE"); refresh(); }}>✕</button>
          </div>
        ))}
      </div>
    </section>
  );
}
