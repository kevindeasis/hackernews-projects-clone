import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, usd, type Detail, type Product, type Status } from "./api";

const LABEL: Record<Status, string> = {
  suggested: "Suggested",
  funding: "Funding",
  testing: "Funded - in testing",
  complete: "Results published",
  expired: "Expired - refunded",
};

function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  const m = hash.match(/^#\/product\/(\d+)/);
  return (
    <div className="wrap">
      <header>
        <a href="#/" className="logo">Laboratory<span>.love</span></a>
        <nav>
          <a href="#/">Products</a>
          <a href="#/suggest">Suggest a product</a>
          <a href="#/about">How it works</a>
        </nav>
      </header>
      {m ? <ProductPage id={Number(m[1])} /> : hash === "#/suggest" ? <Suggest /> : hash === "#/about" ? <About /> : <Home />}
      <footer>Unofficial educational clone. Demo data is synthetic; no real payments are taken.</footer>
    </div>
  );
}

function Home() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["products", status, q], queryFn: () => api.list(status, q) });
  return (
    <>
      <h1>Crowdfund independent lab testing of products you actually buy</h1>
      <div className="filters">
        <input placeholder="Search product, brand, category" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {(Object.keys(LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </select>
      </div>
      {isLoading && <p>Loading…</p>}
      <div className="grid">{data?.map((p) => <Card key={p.id} p={p} />)}</div>
      {data?.length === 0 && <p>No products match.</p>}
    </>
  );
}

function Progress({ p }: { p: Product }) {
  return (
    <div>
      <div className="bar"><div style={{ width: `${p.percent}%` }} /></div>
      <div className="meta">
        <b>{usd(p.raised_cents)}</b> of {usd(p.goal_cents)} · {p.percent}% · {p.backers} backers
        {p.status === "funding" && <> · {p.days_left} days left</>}
      </div>
    </div>
  );
}

function Card({ p }: { p: Product }) {
  return (
    <a className="card" href={`#/product/${p.id}`}>
      <span className={`badge ${p.status}`}>{LABEL[p.status]}</span>
      <h3>{p.name}</h3>
      <p className="muted">{p.brand} · {p.category}</p>
      {p.status !== "suggested" && <Progress p={p} />}
    </a>
  );
}

function ProductPage({ id }: { id: number }) {
  const { data, error } = useQuery({ queryKey: ["product", id], queryFn: () => api.get(id) });
  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data) return <p>Loading…</p>;
  return (
    <>
      <a href="#/">← All products</a>
      <h1>{data.name}</h1>
      <p className="muted">{data.brand} · {data.category}</p>
      <p>{data.description}</p>
      {data.status !== "suggested" && <Progress p={data} />}
      {data.status === "suggested" && <p className="note">Awaiting staff approval before funding opens.</p>}
      {data.status === "funding" && <PledgeForm p={data} />}
      {data.status === "testing" && <p className="note">Fully funded. Three samples from different production lots are being tested.</p>}
      {data.status === "expired" && <p className="note">The goal wasn't reached within 365 days, so every pledge was refunded.</p>}
      {data.status === "complete" && <Results d={data} />}
      <h2>Backers</h2>
      <ul className="backers">
        {data.pledges.map((b, i) => (
          <li key={i} className={b.refunded ? "refunded" : ""}>{b.name} · {usd(b.amount_cents)}{b.refunded ? " (refunded)" : ""}</li>
        ))}
        {data.pledges.length === 0 && <li>No backers yet.</li>}
      </ul>
    </>
  );
}

function PledgeForm({ p }: { p: Product }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", dollars: "25" });
  const m = useMutation({
    mutationFn: () => api.pledge(p.id, { name: f.name, email: f.email, amount_cents: Math.round(Number(f.dollars) * 100) }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <form className="box" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <h2>Contribute to this test</h2>
      <input required placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input required type="number" min={1} step={1} value={f.dollars} onChange={(e) => setF({ ...f, dollars: e.target.value })} />
      <button disabled={m.isPending}>Pledge ${f.dollars}</button>
      {m.error && <p className="error">{(m.error as Error).message}</p>}
      {m.isSuccess && <p className="ok">Thank you! (Demo: no card is charged.)</p>}
      <p className="muted">Refunded automatically if not fully funded within 365 days.</p>
    </form>
  );
}

function Results({ d }: { d: Detail }) {
  const lots = [...new Set(d.results.rows.map((r) => r.lot))];
  const analytes = d.results.summary.map((s) => s.analyte);
  const cell = (analyte: string, lot: string) => {
    const r = d.results.rows.find((x) => x.analyte === analyte && x.lot === lot);
    if (!r) return "-";
    return r.value_ng_g !== null && r.value_ng_g >= r.loq_ng_g ? <b className="det">{r.value_ng_g} ng/g</b> : <span className="muted">ND (&lt;{r.loq_ng_g})</span>;
  };
  return (
    <>
      <h2>Results</h2>
      <table>
        <thead><tr><th>Analyte</th>{lots.map((l) => <th key={l}>Lot {l}</th>)}<th>Detected</th></tr></thead>
        <tbody>
          {d.results.summary.map((s) => (
            <tr key={s.analyte}>
              <td>{s.analyte}</td>
              {lots.map((l) => <td key={l}>{cell(s.analyte, l)}</td>)}
              <td>{s.lots_detected}/{s.lots_tested}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{analytes.length} analytes · ND = not detected (below limit of quantification).</p>
    </>
  );
}

function Suggest() {
  const [f, setF] = useState({ name: "", brand: "", category: "", description: "" });
  const m = useMutation({ mutationFn: () => api.suggest(f), onSuccess: (p) => { location.hash = `#/product/${p.id}`; } });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="box" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <h1>Suggest a product to test</h1>
      <input required placeholder="Product name" value={f.name} onChange={set("name")} />
      <input required placeholder="Brand" value={f.brand} onChange={set("brand")} />
      <input required placeholder="Category (e.g. Dairy)" value={f.category} onChange={set("category")} />
      <textarea placeholder="Why this product?" value={f.description} onChange={set("description")} />
      <button disabled={m.isPending}>Submit suggestion</button>
      {m.error && <p className="error">{(m.error as Error).message}</p>}
    </form>
  );
}

function About() {
  return (
    <>
      <h1>How it works</h1>
      <ol>
        <li>Find or suggest a product; staff approve it and set a funding goal.</li>
        <li>Contribute to its testing fund. If it isn't funded within 365 days, everyone is refunded automatically.</li>
        <li>Once funded, three samples from different production lots are tested for plastic-related chemicals.</li>
        <li>All results are published openly.</li>
      </ol>
    </>
  );
}
