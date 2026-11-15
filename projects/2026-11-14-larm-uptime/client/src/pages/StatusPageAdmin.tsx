import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Monitor, type StatusPage } from "../api";

export default function StatusPageAdmin() {
  const qc = useQueryClient();
  const [f, setF] = useState({ slug: "", title: "", description: "" });
  const [sel, setSel] = useState<number[]>([]);
  const pages = useQuery({ queryKey: ["pages"], queryFn: () => api<StatusPage[]>("/status-pages") });
  const monitors = useQuery({ queryKey: ["monitors"], queryFn: () => api<Monitor[]>("/monitors") });
  const inv = () => qc.invalidateQueries({ queryKey: ["pages"] });
  const add = useMutation({ mutationFn: () => api("/status-pages", { method: "POST", json: { ...f, monitorIds: sel } }), onSuccess: () => { setF({ slug: "", title: "", description: "" }); setSel([]); inv(); } });
  const del = useMutation({ mutationFn: (id: number) => api(`/status-pages/${id}`, { method: "DELETE" }), onSuccess: inv });

  return (
    <>
      <h1>Status pages</h1>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <div className="row">
          <label>Slug<input required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="acme" /></label>
          <label className="grow">Title<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Acme status" /></label>
        </div>
        <label>Description<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <fieldset><legend>Monitors shown</legend>
          {(monitors.data ?? []).map((m) => (
            <label key={m.id} className="check"><input type="checkbox" checked={sel.includes(m.id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))} /> {m.name}</label>
          ))}
        </fieldset>
        {add.error && <p className="error">{(add.error as Error).message}</p>}
        <div><button>Create status page</button></div>
      </form>
      <div className="card list">
        {(pages.data ?? []).length === 0 && <p className="muted pad">No status pages yet.</p>}
        {(pages.data ?? []).map((p) => (
          <div key={p.id} className="item"><div className="grow"><strong>{p.title}</strong><div className="muted small">{p.monitorIds.length} monitor(s)</div></div>
            <Link to={`/status/${p.slug}`} target="_blank">/status/{p.slug} ↗</Link>
            <button className="ghost danger" onClick={() => del.mutate(p.id)}>Delete</button></div>
        ))}
      </div>
    </>
  );
}
