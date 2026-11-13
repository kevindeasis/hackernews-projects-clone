import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money, NEXT_STATUS, type Job } from "./api";

type Tab = "schedule" | "pipeline" | "customers" | "lead";
const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [tab, setTab] = useState<Tab>("schedule");
  const summary = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  return (
    <div className="app">
      <header>
        <h1>🐦 Crewbird</h1>
        <nav>
          {(["schedule", "pipeline", "customers", "lead"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "lead" ? "Lead form" : t}
            </button>
          ))}
        </nav>
        {summary.data && (
          <div className="kpis">
            <span>Outstanding {money(summary.data.unpaidCents)}</span>
            <span>Collected {money(summary.data.paidCents)}</span>
          </div>
        )}
      </header>
      <main>
        {tab === "schedule" && <Schedule />}
        {tab === "pipeline" && <Pipeline />}
        {tab === "customers" && <Customers />}
        {tab === "lead" && <LeadForm />}
      </main>
    </div>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

function JobCard({ job }: { job: Job }) {
  const invalidate = useInvalidate();
  const next = NEXT_STATUS[job.status];
  const m = useMutation({ mutationFn: () => api.setStatus(job.id, next!), onSuccess: invalidate });
  return (
    <div className={`card status-${job.status}`}>
      <strong>{job.title}</strong>
      <div>{job.customer_name} · {job.customer_address}</div>
      <div className="muted">
        {job.scheduled_date ? `${job.scheduled_date} ${job.scheduled_time ?? ""}` : "unscheduled"} · {job.technician_name ?? "unassigned"} · {money(job.price_cents)}
      </div>
      <span className="badge">{job.status.replace("_", " ")}</span>
      {next && <button onClick={() => m.mutate()}>Mark {next.replace("_", " ")}</button>}
      {m.error && <div className="error">{(m.error as Error).message}</div>}
    </div>
  );
}

function Schedule() {
  const [date, setDate] = useState(today());
  const jobs = useQuery({ queryKey: ["jobs", date], queryFn: () => api.jobs(`?date=${date}`) });
  const techs = useQuery({ queryKey: ["techs"], queryFn: api.technicians });
  return (
    <section>
      <label>Day <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="columns">
        {techs.data?.map((t) => (
          <div key={t.id} className="col">
            <h3>{t.name}</h3>
            {jobs.data?.filter((j) => j.technician_id === t.id).map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        ))}
      </div>
      <NewJob />
    </section>
  );
}

function NewJob() {
  const invalidate = useInvalidate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const techs = useQuery({ queryKey: ["techs"], queryFn: api.technicians });
  const [f, setF] = useState({ customer_id: "", technician_id: "", title: "", date: today(), time: "09:00", duration: "60", price: "0" });
  const m = useMutation({
    mutationFn: () => api.addJob({
      customer_id: Number(f.customer_id), technician_id: f.technician_id ? Number(f.technician_id) : null, title: f.title,
      scheduled_date: f.date || null, scheduled_time: f.date ? f.time : null,
      duration_min: Number(f.duration), price_cents: Math.round(Number(f.price) * 100),
    }),
    onSuccess: () => { invalidate(); setF({ ...f, title: "" }); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <h3>New job</h3>
      <select required value={f.customer_id} onChange={set("customer_id")}>
        <option value="">Customer…</option>
        {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={f.technician_id} onChange={set("technician_id")}>
        <option value="">Unassigned</option>
        {techs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input required placeholder="Title" value={f.title} onChange={set("title")} />
      <input type="date" value={f.date} onChange={set("date")} />
      <input type="time" value={f.time} onChange={set("time")} />
      <input type="number" min="15" step="15" value={f.duration} onChange={set("duration")} title="Minutes" />
      <input type="number" min="0" step="0.01" value={f.price} onChange={set("price")} title="Price" />
      <button>Add</button>
      {m.error && <div className="error">{(m.error as Error).message}</div>}
    </form>
  );
}

function Pipeline() {
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs() });
  const stages = ["lead", "scheduled", "in_progress", "done", "invoiced", "paid"] as const;
  return (
    <div className="columns">
      {stages.map((s) => (
        <div key={s} className="col">
          <h3>{s.replace("_", " ")}</h3>
          {jobs.data?.filter((j) => j.status === s).map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      ))}
    </div>
  );
}

function Customers() {
  const invalidate = useInvalidate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: api.customers });
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "" });
  const m = useMutation({ mutationFn: () => api.addCustomer(f), onSuccess: () => { invalidate(); setF({ name: "", phone: "", email: "", address: "" }); } });
  return (
    <section>
      <form className="form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        {(["name", "phone", "email", "address"] as const).map((k) => (
          <input key={k} required={k === "name"} placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
        <button>Add customer</button>
      </form>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th></tr></thead>
        <tbody>{customers.data?.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

/** Public-facing form; in the real product leads also arrive from Google Local Service Ads. */
function LeadForm() {
  const invalidate = useInvalidate();
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", request: "" });
  const m = useMutation({ mutationFn: () => api.addLead(f), onSuccess: () => { invalidate(); setF({ name: "", phone: "", email: "", address: "", request: "" }); } });
  return (
    <form className="form col" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <h3>Request service</h3>
      {(["name", "phone", "email", "address"] as const).map((k) => (
        <input key={k} required={k === "name"} placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      ))}
      <textarea required placeholder="What do you need done?" value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} />
      <button>Send request</button>
      {m.isSuccess && <div>Thanks! We will be in touch — it now shows up in the Pipeline as a lead.</div>}
      {m.error && <div className="error">{(m.error as Error).message}</div>}
    </form>
  );
}
