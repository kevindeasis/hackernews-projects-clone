import { useEffect, useMemo, useState } from "react";
import { Puzzle, Step, Walkthrough, api } from "../api";

interface Props { puzzle: Puzzle; onComplete: () => void; onHint: () => void }

export default function SudokuBoard({ puzzle, onComplete, onHint }: Props) {
  const givens = puzzle.givens!;
  const [grid, setGrid] = useState<number[]>(givens);
  const [sel, setSel] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);
  const [msg, setMsg] = useState("");
  const [walk, setWalk] = useState<Walkthrough | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    setGrid(givens); setSel(null); setWrong([]); setMsg(""); setWalk(null); setStepIdx(0);
  }, [puzzle.id]);

  const cageOf = useMemo(() => {
    const m = new Array<number>(81).fill(-1);
    puzzle.cages?.forEach((c, i) => c.cells.forEach((x) => (m[x] = i)));
    return m;
  }, [puzzle.cages]);
  const cageSum = useMemo(() => {
    const m = new Map<number, number>();
    puzzle.cages?.forEach((c) => m.set(Math.min(...c.cells), c.sum));
    return m;
  }, [puzzle.cages]);

  // In walkthrough mode the board shows the state after `stepIdx` steps.
  const shown = useMemo(() => {
    if (!walk) return grid;
    const g = givens.slice();
    walk.steps.slice(0, stepIdx).forEach((s) => s.placements.forEach((p) => (g[p.cell] = p.digit)));
    return g;
  }, [walk, stepIdx, grid, givens]);
  const step: Step | undefined = walk && stepIdx > 0 ? walk.steps[stepIdx - 1] : undefined;

  const set = (c: number, d: number) => {
    if (givens[c] || walk) return;
    const g = grid.slice();
    g[c] = d;
    setGrid(g);
    setWrong([]);
    if (g.every(Boolean)) {
      api.check(puzzle.id, g).then((r) => {
        if (r.complete) onComplete();
        else { setWrong(r.wrong); setMsg("Something isn't right — highlighted cells are wrong."); }
      });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (sel === null) return;
    if (/^[1-9]$/.test(e.key)) set(sel, Number(e.key));
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") set(sel, 0);
    else if (e.key === "ArrowUp") setSel(Math.max(0, sel - 9));
    else if (e.key === "ArrowDown") setSel(Math.min(80, sel + 9));
    else if (e.key === "ArrowLeft") setSel(Math.max(0, sel - 1));
    else if (e.key === "ArrowRight") setSel(Math.min(80, sel + 1));
    else return;
    e.preventDefault();
  };

  const check = async () => {
    const r = await api.check(puzzle.id, grid);
    setWrong(r.wrong);
    setMsg(r.wrong.length ? `${r.wrong.length} wrong cell(s).` : r.complete ? "Solved!" : `Looks good so far (${r.filled}/81 filled).`);
    if (r.complete) onComplete();
  };

  const openWalkthrough = async () => {
    onHint();
    setWalk(await api.walkthrough(puzzle.id));
    setStepIdx(0);
  };

  return (
    <div className="play">
      <div className="board" tabIndex={0} onKeyDown={onKey}>
        {shown.map((v, c) => {
          const r = Math.floor(c / 9), k = c % 9, cg = cageOf[c];
          const edge = (n: number | null) => n === null || cageOf[n] !== cg;
          const cls = ["cell",
            k % 3 === 0 ? "bl" : "", r % 3 === 0 ? "bt" : "", k === 8 ? "br" : "", r === 8 ? "bb" : "",
            givens[c] ? "given" : "", sel === c ? "sel" : "", wrong.includes(c) ? "wrong" : "",
            step?.focus.includes(c) ? "focus" : "",
            step?.placements.some((p) => p.cell === c) ? "placed" : ""].join(" ");
          return (
            <div key={c} className={cls} onClick={() => setSel(c)}>
              {cg >= 0 && (
                <i className={["cage", edge(r > 0 ? c - 9 : null) ? "t" : "", edge(k < 8 ? c + 1 : null) ? "r" : "",
                  edge(r < 8 ? c + 9 : null) ? "b" : "", edge(k > 0 ? c - 1 : null) ? "l" : ""].join(" ")} />
              )}
              {cageSum.has(c) && <span className="sum">{cageSum.get(c)}</span>}
              {v || ""}
            </div>
          );
        })}
      </div>
      <aside>
        {!walk ? (
          <>
            <div className="pad">{[1,2,3,4,5,6,7,8,9].map((d) => <button key={d} onClick={() => sel !== null && set(sel, d)}>{d}</button>)}<button onClick={() => sel !== null && set(sel, 0)}>⌫</button></div>
            <div className="row"><button onClick={check}>Check</button><button onClick={openWalkthrough}>Walkthrough</button></div>
            {msg && <p className="msg">{msg}</p>}
            <p className="muted">Click a cell and type 1-9. {puzzle.kind === "killer" && "Dashed cages must add up to their corner number with no repeated digit."}</p>
          </>
        ) : (
          <div className="walk">
            <h3>Walkthrough <small>({walk.steps.length} steps)</small></h3>
            <p className="step">{stepIdx === 0 ? "Press Next to see the first deduction." : <><b>{step!.technique}</b>: {step!.description}</>}</p>
            {step?.eliminations.length ? <p className="muted">Removes {step.eliminations.length} candidate(s).</p> : null}
            <div className="row">
              <button disabled={stepIdx === 0} onClick={() => setStepIdx(stepIdx - 1)}>Back</button>
              <button disabled={stepIdx >= walk.steps.length} onClick={() => setStepIdx(stepIdx + 1)}>Next</button>
              <button onClick={() => setWalk(null)}>Close</button>
            </div>
            <p className="muted">Step {stepIdx}/{walk.steps.length}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
