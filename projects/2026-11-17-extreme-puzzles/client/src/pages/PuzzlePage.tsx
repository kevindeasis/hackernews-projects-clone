import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, fmt } from "../api";
import SudokuBoard from "../components/SudokuBoard";
import WordSearchBoard from "../components/WordSearchBoard";

export default function PuzzlePage() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["puzzle", id], queryFn: () => api.puzzle(id) });
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const hints = useRef(0);

  useEffect(() => {
    setSeconds(0);
    setDone(false);
  }, [id]);
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [done, id]);

  const finish = () => {
    if (done) return;
    setDone(true);
    api.result(id, Math.max(1, seconds), hints.current);
  };

  if (q.isLoading) return <p>Loading…</p>;
  if (!q.data) return <p>Puzzle not found. <Link to="/">Back to books</Link></p>;
  const p = q.data;
  return (
    <section>
      <div className="bar">
        <div>
          <h1>{p.kind === "killer" ? "Killer Sudoku" : p.kind === "sudoku" ? "Sudoku" : `Wordsearch · ${p.theme}`} <span className="badge">{p.difficulty}</span></h1>
          <small className="muted">{p.seed}</small>
        </div>
        <div className="timer">{fmt(seconds)}</div>
      </div>
      {done && <div className="banner">Solved in {fmt(seconds)}! <Link to="/">More puzzles</Link></div>}
      {p.kind === "wordsearch" ? (
        <WordSearchBoard puzzle={p} onComplete={finish} onHint={() => hints.current++} />
      ) : (
        <SudokuBoard puzzle={p} onComplete={finish} onHint={() => hints.current++} />
      )}
    </section>
  );
}
