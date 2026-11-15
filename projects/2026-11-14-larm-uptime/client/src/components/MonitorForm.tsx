import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const empty = { name: "", type: "http", target: "", port: "", intervalSec: "180", expectedStatus: "", keyword: "", recordType: "A", graceSec: "60", failThreshold: "2" };

export default function MonitorForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () =>
      api("/monitors", {
        method: "POST",
        json: {
          name: f.name, type: f.type, target: f.target,
          port: f.port ? Number(f.port) : null,
          intervalSec: Number(f.intervalSec), failThreshold: Number(f.failThreshold), graceSec: Number(f.graceSec),
          expectedStatus: f.expectedStatus ? Number(f.expectedStatus) : null,
          keyword: f.keyword || null, recordType: f.recordType,
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monitors"] }); setF(empty); onDone(); },
  });

  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <h3>New monitor</h3>
      <label>Name<input required value={f.name} onChange={set("name")} placeholder="Marketing site" /></label>
      <label>Type
        <select value={f.type} onChange={set("type")}>
          <option value="http">HTTP(S)</option><option value="tcp">TCP port</option>
          <option value="dns">DNS</option><option value="heartbeat">Heartbeat (cron job)</option>
        </select>
      </label>
      {f.type !== "heartbeat" && (
        <label>{f.type === "http" ? "URL" : "Host"}
          <input required value={f.target} onChange={set("target")} placeholder={f.type === "http" ? "https://example.com" : "example.com"} />
        </label>
      )}
      {f.type === "tcp" && <label>Port<input required type="number" value={f.port} onChange={set("port")} /></label>}
      {f.type === "dns" && (
        <label>Record type
          <select value={f.recordType} onChange={set("recordType")}>{["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((r) => <option key={r}>{r}</option>)}</select>
        </label>
      )}
      {f.type === "http" && (
        <>
          <label>Expected status (blank = any 2xx/3xx)<input type="number" value={f.expectedStatus} onChange={set("expectedStatus")} /></label>
          <label>Body must contain<input value={f.keyword} onChange={set("keyword")} /></label>
        </>
      )}
      {f.type === "heartbeat" && <label>Grace period (s)<input type="number" value={f.graceSec} onChange={set("graceSec")} /></label>}
      <div className="row">
        <label>{f.type === "heartbeat" ? "Expected every (s)" : "Check every (s)"}<input type="number" min={10} value={f.intervalSec} onChange={set("intervalSec")} /></label>
        <label>Down after N failures<input type="number" min={1} max={10} value={f.failThreshold} onChange={set("failThreshold")} /></label>
      </div>
      {create.error && <p className="error">{(create.error as Error).message}</p>}
      <div className="row"><button disabled={create.isPending}>Create monitor</button><button type="button" className="ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}
