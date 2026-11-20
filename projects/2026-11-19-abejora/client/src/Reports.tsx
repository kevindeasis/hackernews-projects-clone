import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, fmtDuration, fmtMoney, type Report } from "./api";

export default function Reports() {
  const [groupBy, setGroupBy] = useState("project");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ groupBy, ...(from && { from }), ...(to && { to }) }).toString();
  const report = useQuery({ queryKey: ["report", qs], queryFn: () => api<Report>(`/report?${qs}`) });
  const max = Math.max(1, ...(report.data?.lines.map((l) => l.seconds) ?? []));

  return (
    <section>
      <div className="timer">
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="project">By project</option><option value="client">By client</option><option value="day">By day</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <a className="btn" href={`/api/export.csv?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`}>Export CSV</a>
      </div>
      <p><strong>{fmtDuration(report.data?.totalSeconds ?? 0)}</strong> tracked · <strong>{fmtMoney(report.data?.totalCents ?? 0)}</strong> billable · {report.data?.entries ?? 0} entries</p>
      {report.data?.lines.map((l) => (
        <div key={l.key} className="bar-row">
          <span className="label">{l.label}</span>
          <div className="bar"><i style={{ width: `${(l.seconds / max) * 100}%` }} /></div>
          <span className="mono">{fmtDuration(l.seconds)}</span>
          <span className="mono">{fmtMoney(l.amountCents)}</span>
        </div>
      ))}
    </section>
  );
}
