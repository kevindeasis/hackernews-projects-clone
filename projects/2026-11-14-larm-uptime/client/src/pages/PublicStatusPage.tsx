import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type PublicStatus } from "../api";
import StatusDot from "../components/StatusDot";

const BANNER = {
  operational: ["All systems operational", "ok"], degraded: ["Partial outage", "warn"],
  outage: ["Major outage", "bad"], unknown: ["No data yet", "muted"],
} as const;

export default function PublicStatusPage() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["public", slug], queryFn: () => api<PublicStatus>(`/public/status/${slug}`), retry: false });
  if (q.isError) return <div className="public"><h1>Status page not found</h1></div>;
  if (!q.data) return <div className="public muted">Loading…</div>;
  const d = q.data;
  const [text, cls] = BANNER[d.overall];
  return (
    <div className="public">
      <h1>{d.page.title}</h1>
      {d.page.description && <p className="muted">{d.page.description}</p>}
      <div className={`banner ${cls}`}>{text}</div>
      <div className="card list">
        {d.components.map((c) => (
          <div key={c.id} className="comp">
            <div className="row between"><span><StatusDot status={c.status} /> {c.name}</span><span className="muted small">{c.uptime90d == null ? "no data" : `${c.uptime90d}% (90d)`}</span></div>
            <div className="bars" aria-label="Daily uptime, last 90 days">
              {c.days.slice(-90).map((day) => (
                <i key={day.date} className={day.uptime == null ? "" : day.uptime >= 99.5 ? "ok" : day.uptime >= 95 ? "warn" : "bad"} title={`${day.date}: ${day.uptime ?? "–"}%`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <h2>Past incidents</h2>
      <div className="card list">
        {d.incidents.length === 0 && <p className="muted pad">No incidents reported.</p>}
        {d.incidents.map((i) => (
          <div key={i.id} className="item"><StatusDot status={i.resolvedAt ? "up" : "down"} />
            <div className="grow">{i.monitorName} {i.resolvedAt ? "was unavailable" : "is experiencing issues"}</div>
            <div className="muted small">{new Date(i.startedAt).toLocaleString()}</div></div>
        ))}
      </div>
      <p className="muted small center">Powered by a Larm clone</p>
    </div>
  );
}
