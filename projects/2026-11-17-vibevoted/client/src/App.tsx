import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Row } from "./api";

function useHashSlug() {
  const read = () => window.location.hash.replace(/^#\/?/, "") || null;
  const [slug, setSlug] = useState(read);
  useEffect(() => {
    const on = () => setSlug(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return slug;
}

export function App() {
  const slug = useHashSlug();
  return (
    <div className="wrap">
      <header>
        <a href="#/" className="logo">VibeVoted <small>clone</small></a>
        <span className="muted">Products judged by a panel of 10 AI judges</span>
      </header>
      {slug ? <CompetitionPage slug={slug} /> : <Home />}
    </div>
  );
}

function Home() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["competitions"], queryFn: api.competitions });
  const { data: judges = [] } = useQuery({ queryKey: ["judges"], queryFn: api.judges });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => api.createCompetition({ title, description }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["competitions"] }); window.location.hash = `#/${c.slug}`; },
  });
  return (
    <>
      <section className="card">
        <h2>Start a competition</h2>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <input placeholder="Title, e.g. Best side project of November" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea placeholder="What are the products competing for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button disabled={create.isPending}>Create</button>
          {create.error && <p className="err">{(create.error as Error).message}</p>}
        </form>
      </section>
      <h2>Competitions</h2>
      {data.length === 0 && <p className="muted">None yet — create the first one.</p>}
      {data.map((c) => (
        <a key={c.id} className="card link" href={`#/${c.slug}`}>
          <strong>{c.title}</strong> <span className="muted">· {c.product_count} products</span>
          <div className="muted">{c.description}</div>
        </a>
      ))}
      <h2>The judges</h2>
      <div className="judges">
        {judges.map((j) => <div key={j.id} className="card"><strong>{j.name}</strong><div className="muted">{j.persona}</div></div>)}
      </div>
    </>
  );
}

function CompetitionPage({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["competition", slug], queryFn: () => api.competition(slug) });
  const { data: judges = [] } = useQuery({ queryKey: ["judges"], queryFn: api.judges });
  const refresh = () => qc.invalidateQueries({ queryKey: ["competition", slug] });
  const [form, setForm] = useState({ name: "", url: "", tagline: "", description: "" });
  const add = useMutation({ mutationFn: () => api.addProduct(slug, form), onSuccess: () => { setForm({ name: "", url: "", tagline: "", description: "" }); refresh(); } });
  const rerun = useMutation({ mutationFn: () => api.evaluate(slug), onSuccess: refresh });
  const del = useMutation({ mutationFn: api.deleteProduct, onSuccess: refresh });
  const [open, setOpen] = useState<number | null>(null);
  if (error) return <p className="err">{(error as Error).message}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { competition: c, leaderboard } = data;
  const judgeName = (id: string) => judges.find((j) => j.id === id)?.name ?? id;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <h1>{c.title}</h1>
      <p className="muted">{c.description} Criteria: {c.criteria.join(", ")}</p>
      <section className="card">
        <h2>Submit a product</h2>
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <input placeholder="Name" value={form.name} onChange={set("name")} required />
          <input placeholder="URL" value={form.url} onChange={set("url")} />
          <input placeholder="One-line tagline" value={form.tagline} onChange={set("tagline")} />
          <textarea placeholder="Describe what it does and who it is for" value={form.description} onChange={set("description")} />
          <button disabled={add.isPending}>{add.isPending ? "Judging…" : "Submit & judge"}</button>
          {add.error && <p className="err">{(add.error as Error).message}</p>}
        </form>
      </section>
      <div className="bar">
        <h2>Leaderboard</h2>
        <button onClick={() => rerun.mutate()} disabled={rerun.isPending}>Re-run all judges</button>
      </div>
      {leaderboard.length === 0 && <p className="muted">No products yet.</p>}
      {leaderboard.map((r: Row) => (
        <div key={r.product.id} className="card">
          <div className="row" onClick={() => setOpen(open === r.product.id ? null : r.product.id)}>
            <span className="rank">{r.rank ?? "–"}</span>
            <div className="grow">
              <strong>{r.product.name}</strong>{" "}
              {r.product.url && <a href={r.product.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>↗</a>}
              <div className="muted">{r.product.tagline}</div>
            </div>
            <div className="score">{r.mean?.toFixed(1) ?? "–"}<small> ±{r.stdev?.toFixed(1) ?? "–"} · {r.borda} pts</small></div>
            <button className="ghost" onClick={(e) => { e.stopPropagation(); del.mutate(r.product.id); }}>✕</button>
          </div>
          {open === r.product.id && (
            <table>
              <thead><tr><th>Judge</th>{c.criteria.map((k) => <th key={k}>{k}</th>)}<th>Overall</th><th>Take</th></tr></thead>
              <tbody>
                {r.evaluations.map((e) => (
                  <tr key={e.judge_id}>
                    <td>{judgeName(e.judge_id)}</td>
                    {c.criteria.map((k) => <td key={k}>{e.scores[k]?.toFixed(1)}</td>)}
                    <td><strong>{e.overall.toFixed(1)}</strong></td>
                    <td className="muted">{e.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
