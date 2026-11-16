import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken } from "./api";

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const STARTER = `<!doctype html>\n<html>\n  <body style="font-family:sans-serif;text-align:center;padding:4rem">\n    <h1>Hello from Gangway ⚓</h1>\n  </body>\n</html>\n`;

export default function App() {
  const [token, setTok] = useState(getToken());
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites, enabled: !!token, retry: false });

  if (!token || sites.isError) {
    return (
      <main className="narrow">
        <h1>⚓ Gangway</h1>
        <p className="muted">Enter your API token (<code>GANGWAY_TOKEN</code>, default <code>dev-token</code>).</p>
        <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("t") as string; setToken(v); setTok(v); qc.invalidateQueries(); }}>
          <input name="t" type="password" placeholder="token" defaultValue={token} autoFocus />
          <button>Sign in</button>
        </form>
        {sites.isError && <p className="error">{(sites.error as Error).message}</p>}
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>⚓ Gangway</h1>
        <button className="link" onClick={() => { setToken(""); setTok(""); }}>Sign out</button>
      </header>
      <div className="grid">
        <section>
          <DeployForm onDeployed={(s) => { qc.invalidateQueries({ queryKey: ["sites"] }); setSelected(s); }} />
        </section>
        <section>
          <h2>Sites</h2>
          {sites.data?.length === 0 && <p className="muted">Nothing deployed yet.</p>}
          <ul className="sites">
            {sites.data?.map((s) => (
              <li key={s.slug} className={selected === s.slug ? "active" : ""} onClick={() => setSelected(s.slug)}>
                <strong>{s.name}</strong>
                <a href={`/s/${s.slug}/`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>/s/{s.slug}/</a>
                <span className="muted">v{s.active_version} · {s.versions} deploys · {kb(s.bytes)}</span>
              </li>
            ))}
          </ul>
          {selected && <SiteDetail slug={selected} onGone={() => setSelected(null)} />}
        </section>
      </div>
    </main>
  );
}

function DeployForm({ onDeployed }: { onDeployed: (slug: string) => void }) {
  const [html, setHtml] = useState(STARTER);
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [zip, setZip] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const meta = { slug: slug || undefined, note: note || undefined };
      return zip ? api.deployArchive(zip, meta) : api.deployHtml({ ...meta, html });
    },
    onSuccess: (r) => { onDeployed(r.slug); setSlug(r.slug); setZip(null); },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <h2>Deploy</h2>
      <label>Slug <span className="muted">(blank = random; reuse to ship a new version)</span>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-site" />
      </label>
      <label>Note <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what changed?" /></label>
      <label>Paste HTML
        <textarea rows={10} value={html} onChange={(e) => setHtml(e.target.value)} disabled={!!zip} spellCheck={false} />
      </label>
      <label>…or upload a .zip (must contain index.html)
        <input type="file" accept=".zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} />
      </label>
      <button disabled={m.isPending}>{m.isPending ? "Deploying…" : "Deploy"}</button>
      {m.isError && <p className="error">{(m.error as Error).message}</p>}
      {m.isSuccess && <p className="ok">Live at <a href={m.data.url} target="_blank" rel="noreferrer">{m.data.url}</a> (v{m.data.version})</p>}
    </form>
  );
}

function SiteDetail({ slug, onGone }: { slug: string; onGone: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["site", slug], queryFn: () => api.site(slug) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["sites"] }); qc.invalidateQueries({ queryKey: ["site", slug] }); };
  const rb = useMutation({ mutationFn: (v: number) => api.rollback(slug, v), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => api.remove(slug), onSuccess: () => { refresh(); onGone(); } });
  if (!q.data) return null;
  return (
    <div className="detail">
      <h3>{q.data.name} <button className="danger" onClick={() => confirm(`Delete ${slug}?`) && del.mutate()}>Delete</button></h3>
      <iframe title="preview" src={`/s/${slug}/?v=${q.data.active_version}`} sandbox="allow-scripts" />
      <table>
        <thead><tr><th>Version</th><th>Deployed</th><th>Files</th><th>Size</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {q.data.versions.map((v) => (
            <tr key={v.version}>
              <td>v{v.version}{v.version === q.data!.active_version && " ✓"}</td>
              <td>{new Date(v.created_at).toLocaleString()}</td>
              <td>{v.file_count}</td><td>{kb(v.bytes)}</td><td>{v.note}</td>
              <td>{v.version !== q.data!.active_version && <button onClick={() => rb.mutate(v.version)}>Activate</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(rb.isError || del.isError) && <p className="error">{((rb.error || del.error) as Error).message}</p>}
    </div>
  );
}
