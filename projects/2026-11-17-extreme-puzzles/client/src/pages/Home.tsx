import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { KINDS, LEVELS, Kind, Level, api, fmt } from "../api";

export default function Home() {
  const [kind, setKind] = useState<Kind>("sudoku");
  const [level, setLevel] = useState<Level>("hard");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const book = useQuery({ queryKey: ["book", kind, level], queryFn: () => api.book(kind, level) });

  const open = async (page?: number) => {
    setBusy(true);
    try {
      nav(`/puzzle/${(await api.create(kind, level, page)).id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>Puzzle books</h1>
      <p className="muted">Pick a book. Each page is a fixed puzzle (same seed, same puzzle). Stuck? Every puzzle has a step-by-step walkthrough.</p>
      <div className="tabs">{KINDS.map((k) => <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
      <div className="tabs">{LEVELS.map((l) => <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l}</button>)}</div>
      <div className="pages">
        {book.data?.pages.map((p) => (
          <button key={p.page} className="page" disabled={busy} onClick={() => open(p.page)}>
            <b>{p.page}</b>
            <small>{p.bestSeconds ? `best ${fmt(p.bestSeconds)}` : p.puzzleId ? "started" : "new"}</small>
          </button>
        ))}
      </div>
      <button className="primary" disabled={busy} onClick={() => open()}>{busy ? "Generating…" : "Random puzzle"}</button>
    </section>
  );
}
