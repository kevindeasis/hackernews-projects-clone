import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ms, type MonitorDetail } from "../api";
import StatusDot from "../components/StatusDot";

const RANGES = ["1h", "24h", "7d", "30d", "90d"];

export default function MonitorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [range, setRange] = useState("24h");
  const q = useQuery({ queryKey: ["monitor", id, range], queryFn: () => api<MonitorDetail>(`/monitors/${id}?range=${range}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["monitor", id] }); qc.invalidateQueries({ queryKey: ["monitors"] }); };
  const checkNow = useMutation({ mutationFn: () => api(`/monitors/${id}/check`, { method: "POST" }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (paused: boolean) => api(`/monitors/${id}`, { method: "PATCH", json: { paused } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => api(`/monitors/${id}`, { method: "DELETE" }), onSuccess: () => { refresh(); nav("/"); } });

  if (q.isLoading) return <p className="muted">Loading…</p>;
  if (!q.data) return <p className="error">Monitor not found.</p>;
  const { monitor: m, stats, checks, incidents } = q.data;
  const series = checks.map((c) => ({ t: new Date(c.at).toLocaleString(), latency: c.ok ? c.latencyMs : null }));
  const last = [...checks].reverse().find((c) => c.ttfbMs != null);
  const trace = last ? [
    { phase: "DNS", v: last.dnsMs ?? 0 }, { phase: "TCP", v: last.tcpMs ?? 0 }, { phase: "TLS", v: last.tlsMs ?? 0 },
    { phase: "TTFB", v: last.ttfbMs ?? 0 }, { phase: "Transfer", v: last.transferMs ?? 0 },
  ] : [];
  const daysLeft = stats.certExpiresAt ? Math.floor((stats.certExpiresAt - Date.now()) / 86_400_000) : null;

  return (
    <>
      <div className="row between">
        <h1><StatusDot status={m.status} paused={m.paused} /> {m.name}</h1>
        <div className="row">
          <button onClick={() => checkNow.mutate()} disabled={checkNow.isPending}>Check now</button>
          <button className="ghost" onClick={() => toggle.mutate(!m.paused)}>{m.paused ? "Resume" : "Pause"}</button>
          <button className="ghost danger" onClick={() => confirm("Delete this monitor?") && del.mutate()}>Delete</button>
        </div>
      </div>
      <p className="muted">{m.type.toUpperCase()} · {m.type === "tcp" ? `${m.target}:${m.port}` : m.target || "heartbeat"} · every {m.intervalSec}s · down after {m.failThreshold} failures</p>
      {m.heartbeatPath && (
        <div className="card pad">
          <strong>Ping URL</strong> <span className="muted small">(call it from your job; <code>curl</code> works)</span>
          <pre>{`${location.origin}${m.heartbeatPath}`}</pre>
        </div>
      )}
      <div className="tabs">{RANGES.map((r) => <button key={r} className={r === range ? "tab on" : "tab"} onClick={() => setRange(r)}>{r}</button>)}</div>
      <div className="stats">
        <Stat label="Uptime" value={stats.uptime == null ? "–" : `${stats.uptime}%`} />
        <Stat label="p50" value={ms(stats.p50)} /><Stat label="p95" value={ms(stats.p95)} /><Stat label="p99" value={ms(stats.p99)} />
        <Stat label="Checks" value={String(stats.checks)} />
        {daysLeft != null && <Stat label="SSL expires in" value={`${daysLeft}d`} warn={daysLeft < 14} />}
      </div>
      {m.type !== "heartbeat" && (
        <div className="card pad">
          <h3>Response time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3140" />
              <XAxis dataKey="t" hide /><YAxis unit="ms" width={60} stroke="#8b95a7" />
              <Tooltip formatter={(v: number) => ms(v)} contentStyle={{ background: "#151a23", border: "1px solid #2a3140" }} />
              <Area type="monotone" dataKey="latency" stroke="#4ade80" fill="#4ade8033" connectNulls={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {trace.length > 0 && (
        <div className="card pad">
          <h3>Latest request trace</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trace} layout="vertical">
              <XAxis type="number" unit="ms" stroke="#8b95a7" /><YAxis type="category" dataKey="phase" width={70} stroke="#8b95a7" />
              <Tooltip formatter={(v: number) => ms(v)} contentStyle={{ background: "#151a23", border: "1px solid #2a3140" }} />
              <Bar dataKey="v" fill="#60a5fa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <h2>Incidents</h2>
      <div className="card list">
        {incidents.length === 0 && <p className="muted pad">No incidents.</p>}
        {incidents.map((i) => (
          <div key={i.id} className="item"><StatusDot status={i.resolvedAt ? "up" : "down"} />
            <div className="grow">{i.cause}</div>
            <div className="muted small">{new Date(i.startedAt).toLocaleString()} → {i.resolvedAt ? new Date(i.resolvedAt).toLocaleTimeString() : "ongoing"}</div>
          </div>
        ))}
      </div>
      <h2>Recent checks</h2>
      <div className="card list">
        {[...checks].reverse().slice(0, 15).map((c) => (
          <div key={c.at} className="item small">
            <StatusDot status={c.ok ? "up" : "down"} />
            <div className="grow">{new Date(c.at).toLocaleTimeString()} {c.statusCode ? `· HTTP ${c.statusCode}` : ""} {c.error ? `· ${c.error}` : ""}</div>
            <div className="num">{ms(c.latencyMs)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className={`stat card ${warn ? "warn" : ""}`}><div className="muted small">{label}</div><div className="big">{value}</div></div>;
}
