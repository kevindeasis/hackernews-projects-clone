import { useEffect, useRef, useState } from "react";
import { Puzzle, api } from "../api";

interface Props { puzzle: Puzzle; onComplete: () => void; onHint: () => void }
type Cell = [number, number];

export default function WordSearchBoard({ puzzle, onComplete }: Props) {
  const grid = puzzle.grid as string[];
  const [found, setFound] = useState<Record<string, Cell[]>>({});
  const [start, setStart] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const startRef = useRef<Cell | null>(null);

  useEffect(() => { setFound({}); setStart(null); }, [puzzle.id]);

  const line = (a: Cell, b: Cell): Cell[] => {
    const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    if (b[0] !== a[0] && b[1] !== a[1] && Math.abs(b[0] - a[0]) !== Math.abs(b[1] - a[1])) return [a];
    return Array.from({ length: n + 1 }, (_, i) => [a[0] + dr * i, a[1] + dc * i] as Cell);
  };

  const end = async (b: Cell) => {
    const a = startRef.current;
    startRef.current = null;
    setStart(null);
    if (!a || (a[0] === b[0] && a[1] === b[1])) return;
    const { word } = await api.select(puzzle.id, a[0], a[1], b[0], b[1]);
    if (word && !found[word]) {
      const next = { ...found, [word]: line(a, b) };
      setFound(next);
      if (Object.keys(next).length === puzzle.words!.length) onComplete();
    }
  };

  const cellAt = (e: React.PointerEvent): Cell | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const r = el?.dataset.r, c = el?.dataset.c;
    return r !== undefined && c !== undefined ? [Number(r), Number(c)] : null;
  };

  const preview = start && hover ? line(start, hover) : [];
  const foundSet = new Set(Object.values(found).flat().map(([r, c]) => `${r},${c}`));
  const previewSet = new Set(preview.map(([r, c]) => `${r},${c}`));

  return (
    <div className="play">
      <div
        className="ws"
        style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`, ["--n" as string]: puzzle.size }}
        onPointerDown={(e) => { const c = cellAt(e); if (c) { startRef.current = c; setStart(c); setHover(c); } }}
        onPointerMove={(e) => { if (startRef.current) setHover(cellAt(e)); }}
        onPointerUp={(e) => { const c = cellAt(e); if (c) end(c); else { startRef.current = null; setStart(null); } }}
      >
        {grid.map((rowStr, r) => [...rowStr].map((ch, c) => (
          <div key={`${r}-${c}`} data-r={r} data-c={c}
            className={`wc ${foundSet.has(`${r},${c}`) ? "found" : ""} ${previewSet.has(`${r},${c}`) ? "pick" : ""}`}>{ch}</div>
        )))}
      </div>
      <aside>
        <h3>Find {puzzle.words!.length} words</h3>
        <ul className="words">{puzzle.words!.map((w) => <li key={w} className={found[w] ? "done" : ""}>{w}</li>)}</ul>
        <p className="muted">Drag from the first to the last letter. Words run in straight lines{puzzle.difficulty === "easy" ? " (right or down)" : puzzle.difficulty === "medium" ? " (right, down or diagonal)" : ", in any direction, including backwards"}.</p>
      </aside>
    </div>
  );
}
