import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Channel } from "../api";

export default function Settings() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const channels = useQuery({ queryKey: ["channels"], queryFn: () => api<Channel[]>("/channels") });
  const inv = () => qc.invalidateQueries({ queryKey: ["channels"] });
  const add = useMutation({ mutationFn: () => api("/channels", { method: "POST", json: { name, url } }), onSuccess: () => { setName(""); setUrl(""); inv(); } });
  const del = useMutation({ mutationFn: (id: number) => api(`/channels/${id}`, { method: "DELETE" }), onSuccess: inv });
  const test = useMutation({ mutationFn: () => api<{ delivered: number }>("/channels/test", { method: "POST" }) });

  return (
    <>
      <h1>Alert channels</h1>
      <p className="muted">Webhooks receive a JSON POST with <code>text</code> (Slack) and <code>content</code> (Discord) when a monitor goes down or recovers.</p>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <div className="row">
          <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="#ops" /></label>
          <label className="grow">Webhook URL<input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" /></label>
        </div>
        {add.error && <p className="error">{(add.error as Error).message}</p>}
        <div className="row"><button>Add channel</button><button type="button" className="ghost" onClick={() => test.mutate()}>Send test alert</button>
          {test.data && <span className="muted">Delivered to {test.data.delivered} channel(s)</span>}</div>
      </form>
      <div className="card list">
        {(channels.data ?? []).length === 0 && <p className="muted pad">No channels yet.</p>}
        {(channels.data ?? []).map((c) => (
          <div key={c.id} className="item"><div className="grow"><strong>{c.name}</strong><div className="muted small">{c.url}</div></div>
            <button className="ghost danger" onClick={() => del.mutate(c.id)}>Remove</button></div>
        ))}
      </div>
    </>
  );
}
