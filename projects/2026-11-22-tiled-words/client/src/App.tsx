import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, localToday } from "./api";
import { Game } from "./Game";

function useHash(): string {
  const [hash, setHash] = useState(location.hash || "#/daily");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/daily");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function Archive() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["archive", page], queryFn: () => api.archive(page) });
  return (
    <section>
      <h2>Past puzzles</h2>
      <ul className="archive">
        {q.data?.items.map((i) => (
          <li key={i.key}>
            <a href={`#/p/${i.key}`}>{i.key === localToday() ? `${i.key} (today)` : i.key}</a>
            {i.completed && <span className="done"> ✓ solved</span>}
          </li>
        ))}
      </ul>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button>
        <span>Page {page} / {q.data?.pages ?? "…"}</span>
        <button disabled={!!q.data && page >= q.data.pages} onClick={() => setPage(page + 1)}>Older →</button>
      </div>
    </section>
  );
}

export function App() {
  const hash = useHash();
  const stats = useQuery({ queryKey: ["stats", hash], queryFn: api.stats });
  let body;
  if (hash === "#/archive") body = <Archive />;
  else if (hash === "#/practice" || hash.startsWith("#/practice/")) {
    const key = hash.split("/")[2] ?? "";
    if (!key) {
      const fresh = Math.random().toString(36).slice(2, 10);
      location.replace(`#/practice/${fresh}`);
      body = null;
    } else body = <Game key={key} puzzleKey={`practice-${key}`} label="Practice puzzle" />;
  } else if (hash.startsWith("#/p/")) {
    const key = hash.slice(4);
    body = <Game key={key} puzzleKey={key} label={`Puzzle ${key}`} />;
  } else body = <Game key="daily" puzzleKey="daily" label={`Today's puzzle · ${localToday()}`} />;

  return (
    <div className="app">
      <header>
        <h1>Tiled Words <small>clone</small></h1>
        <nav>
          <a href="#/daily">Today</a>
          <a href="#/archive">Archive</a>
          <a href="#/practice">Practice</a>
        </nav>
        <div className="stats" title="Daily-puzzle streak">
          🔥 {stats.data?.current ?? 0} <span>best {stats.data?.best ?? 0} · solved {stats.data?.played ?? 0}</span>
        </div>
      </header>
      <main>{body}</main>
      <footer>Unofficial clone of tiledwords.com for learning. Drag tiles into the board, tap a tile to rotate it.</footer>
    </div>
  );
}
