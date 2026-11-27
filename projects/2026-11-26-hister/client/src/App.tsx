import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Hit } from "./api";

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Snippets come from FTS5 containing only <mark> tags; escape everything else before rendering. */
function safeSnippet(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/&lt;mark>/g, "<mark>")
    .replace(/&lt;\/mark>/g, "</mark>");
}

function Result({ hit, onDelete, onBlock }: { hit: Hit; onDelete: () => void; onBlock: () => void }) {
  return (
    <li className="result">
      <a href={hit.url} target="_blank" rel="noreferrer" className="title">
        {hit.title || hit.url}
      </a>
      <div className="meta">
        {hit.url} · {hit.visits} visit{hit.visits === 1 ? "" : "s"} · {new Date(hit.last_seen).toLocaleDateString()}
      </div>
      {hit.snippet && <p dangerouslySetInnerHTML={{ __html: safeSnippet(hit.snippet) }} />}
      <div className="actions">
        <button onClick={onDelete}>Forget</button>
        <button onClick={onBlock}>Block {hit.domain}</button>
      </div>
    </li>
  );
}

export function App() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<"search" | "settings">("search");
  const dq = useDebounced(q.trim());
  const refresh = () => qc.invalidateQueries();

  const results = useQuery({ queryKey: ["search", dq], queryFn: () => (dq ? api.search(dq) : api.recent()) });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const blocklist = useQuery({ queryKey: ["blocklist"], queryFn: api.blocklist });

  const add = useMutation({ mutationFn: api.addUrl, onSuccess: () => { setUrl(""); refresh(); } });
  const del = useMutation({ mutationFn: api.remove, onSuccess: refresh });
  const block = useMutation({ mutationFn: api.block, onSuccess: refresh });
  const unblock = useMutation({ mutationFn: api.unblock, onSuccess: refresh });

  const origin = window.location.origin.replace(":5173", ":3001");
  const bookmarklet = `javascript:(function(){fetch('${origin}/api/pages',{method:'POST',mode:'no-cors',headers:{'content-type':'text/plain'},body:JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,200000)})}).then(function(){alert('Indexed in Hister')})})()`;

  return (
    <div className="wrap">
      <header>
        <h1>Hister</h1>
        <nav>
          <button className={tab === "search" ? "on" : ""} onClick={() => setTab("search")}>Search</button>
          <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Settings</button>
        </nav>
      </header>

      {tab === "search" ? (
        <>
          <input
            className="search"
            autoFocus
            placeholder='Search your history…  "phrase"  -exclude  domain:example.com'
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {stats.data && (
            <p className="muted">
              {stats.data.pages} pages from {stats.data.domains} domains indexed
            </p>
          )}
          {results.data?.length === 0 && <p className="muted">{dq ? "No matches." : "Nothing indexed yet — add a URL in Settings."}</p>}
          <ul className="results">
            {results.data?.map((h) => (
              <Result key={h.id} hit={h} onDelete={() => del.mutate(h.id)} onBlock={() => block.mutate(h.domain)} />
            ))}
          </ul>
        </>
      ) : (
        <section>
          <h2>Add a page</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (url) add.mutate(url); }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" />
            <button disabled={add.isPending}>{add.isPending ? "Fetching…" : "Index"}</button>
          </form>
          {add.error && <p className="err">{(add.error as Error).message}</p>}

          <h2>Index pages as you browse</h2>
          <p className="muted">
            Drag this to your bookmarks bar and click it on any page you want indexed (it sends the text your browser already rendered, so
            logged-in pages work too):
          </p>
          <p>
            {/* eslint-disable-next-line no-script-url */}
            <a className="bm" href={bookmarklet} onClick={(e) => e.preventDefault()}>+ Hister</a>
          </p>

          <h2>Blocked domains</h2>
          <p className="muted">Pages from these domains (and their subdomains) are never indexed. Blocking also purges existing pages.</p>
          <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget).get("d") as string; if (d) { block.mutate(d); e.currentTarget.reset(); } }}>
            <input name="d" placeholder="bank.example.com" />
            <button>Block</button>
          </form>
          <ul className="chips">
            {blocklist.data?.map((d) => (
              <li key={d}>{d} <button onClick={() => unblock.mutate(d)}>×</button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
