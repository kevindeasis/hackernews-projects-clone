import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ago, api, ms, type Incident, type Monitor } from "../api";
import MonitorForm from "../components/MonitorForm";
import StatusDot from "../components/StatusDot";

export default function Dashboard() {
  const [adding, setAdding] = useState(false);
  const monitors = useQuery({ queryKey: ["monitors"], queryFn: () => api<Monitor[]>("/monitors") });
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: () => api<Incident[]>("/incidents") });
  const list = monitors.data ?? [];
  const down = list.filter((m) => m.status === "down" && !m.paused).length;

  return (
    <>
      <div className="row between">
        <div>
          <h1>Monitors</h1>
          <p className="muted">{list.length === 0 ? "Nothing monitored yet." : down ? `${down} of ${list.length} down` : `All ${list.length} monitors operational`}</p>
        </div>
        <button onClick={() => setAdding(true)}>+ New monitor</button>
      </div>
      {adding && <MonitorForm onDone={() => setAdding(false)} />}
      <div className="card list">
        {list.map((m) => (
          <Link key={m.id} to={`/monitors/${m.id}`} className="item">
            <StatusDot status={m.status} paused={m.paused} />
            <div className="grow">
              <strong>{m.name}</strong>
              <div className="muted small">{m.type.toUpperCase()} · {m.type === "tcp" ? `${m.target}:${m.port}` : m.type === "heartbeat" ? "heartbeat" : m.target}</div>
            </div>
            <div className="num"><span className="muted small">24h</span> {m.uptime24h == null ? "–" : `${m.uptime24h}%`}</div>
            <div className="num"><span className="muted small">p95</span> {ms(m.p95)}</div>
            <div className="muted small num">{ago(m.lastCheckedAt)}</div>
          </Link>
        ))}
      </div>
      <h2>Recent incidents</h2>
      <div className="card list">
        {(incidents.data ?? []).length === 0 && <p className="muted pad">No incidents. 🎉</p>}
        {(incidents.data ?? []).map((i) => (
          <div key={i.id} className="item">
            <StatusDot status={i.resolvedAt ? "up" : "down"} />
            <div className="grow"><strong>{i.monitorName}</strong><div className="muted small">{i.cause}</div></div>
            <div className="muted small">{new Date(i.startedAt).toLocaleString()} → {i.resolvedAt ? new Date(i.resolvedAt).toLocaleTimeString() : "ongoing"}</div>
          </div>
        ))}
      </div>
    </>
  );
}
