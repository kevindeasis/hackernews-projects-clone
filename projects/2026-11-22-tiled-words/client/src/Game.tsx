import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PublicTile, type PuzzleData, type SavedState } from "./api";

const TILE = 3;

function rotateCW(m: string[][]): string[][] {
  const n = m.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => m[n - 1 - c][r]));
}
const rotated = (cells: string[][], turns: number) => {
  let out = cells;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = rotateCW(out);
  return out;
};

function TileView({ tile, turns, locked }: { tile: PublicTile; turns: number; locked?: boolean }) {
  const cells = rotated(tile.cells, turns);
  return (
    <div className={`tile ${locked ? "locked" : ""}`} style={{ transform: "none" }}>
      {cells.flat().map((ch, i) => (
        <div key={i} className={ch === "#" ? "cell block" : "cell"}>{ch === "#" ? "" : ch}</div>
      ))}
    </div>
  );
}

function DraggableTile(props: { tile: PublicTile; turns: number; locked: boolean; onRotate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `tile-${props.tile.id}`, disabled: props.locked });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable ${isDragging ? "dragging" : ""}`}
      data-testid={`tile-${props.tile.id}`}
      onClick={() => !props.locked && props.onRotate()}
      {...listeners}
      {...attributes}
    >
      <TileView tile={props.tile} turns={props.turns} locked={props.locked} />
    </div>
  );
}

function Slot({ index, children }: { index: number; children?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}` });
  return (
    <div ref={setNodeRef} className={`slot ${isOver ? "over" : ""}`} data-testid={`slot-${index}`}>
      {children}
    </div>
  );
}

function Tray({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });
  return <div ref={setNodeRef} className={`tray ${isOver ? "over" : ""}`}>{children}</div>;
}

export function Game({ puzzleKey, label }: { puzzleKey: string; label: string }) {
  const q = useQuery({ queryKey: ["puzzle", puzzleKey], queryFn: () => api.puzzle(puzzleKey) });
  const prog = useQuery({ queryKey: ["progress", puzzleKey], queryFn: () => api.progress(q.data!.key), enabled: !!q.data });
  if (q.isError) return <p className="error">{(q.error as Error).message}</p>;
  if (!q.data || !prog.data) return <p>Loading…</p>;
  return <Board puzzle={q.data} label={label} saved={prog.data.state} reveals={prog.data.reveals} moves0={prog.data.moves} completed={prog.data.completed} />;
}

function Board({ puzzle, label, saved, reveals: reveals0, moves0, completed }: { puzzle: PuzzleData; label: string; saved: SavedState | null; reveals: number; moves0: number; completed: boolean }) {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<(number | null)[]>(saved?.slots ?? Array(9).fill(null));
  const [rot, setRot] = useState<Record<string, number>>(saved?.rot ?? {});
  const [locked, setLocked] = useState<number[]>(saved?.locked ?? []);
  const [moves, setMoves] = useState(moves0);
  const [reveals, setReveals] = useState(reveals0);
  const [correct, setCorrect] = useState<string[]>([]);
  const [solved, setSolved] = useState(completed);
  const [share, setShare] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const [trayOrder, setTrayOrder] = useState<number[]>(puzzle.tray);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const tileById = useMemo(() => new Map(puzzle.tiles.map((t) => [t.id, t])), [puzzle]);
  const turnsOf = (id: number) => rot[String(id)] ?? 0;
  const trayTiles = trayOrder.filter((id) => !slots.includes(id));

  // Ask the server which clues are currently satisfied; persist progress.
  const checkSeq = useRef(0);
  useEffect(() => {
    const payload = slots.map((id) => (id === null ? null : { tile: id, rot: turnsOf(id) }));
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.check(puzzle.key, payload, moves);
        if (seq !== checkSeq.current) return;
        setCorrect(r.correctEntries);
        if (r.solved) {
          setSolved(true);
          if (r.share) setShare(r.share);
          qc.invalidateQueries({ queryKey: ["stats"] });
        }
        await api.saveProgress(puzzle.key, { slots, rot, locked }, moves);
      } catch {
        /* offline: keep playing */
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, rot, locked]);

  const rotateTile = (id: number) => {
    setRot((r) => ({ ...r, [String(id)]: ((r[String(id)] ?? 0) + 1) % 4 }));
    setMoves((m) => m + 1);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(String(e.active.id).replace("tile-", ""));
    const over = e.over ? String(e.over.id) : null;
    if (!over || solved) return;
    const from = slots.indexOf(id);
    const next = slots.slice();
    if (over === "tray") {
      if (from === -1) return;
      next[from] = null;
    } else {
      const to = Number(over.replace("slot-", ""));
      const other = next[to];
      if (other !== null && locked.includes(other)) return;
      if (to === from) return;
      if (from !== -1) next[from] = other; // swap (other may be null)
      next[to] = id;
    }
    setSlots(next);
    setMoves((m) => m + 1);
  };

  const shuffleTray = () => setTrayOrder((o) => o.slice().sort(() => Math.random() - 0.5));

  const doReveal = useCallback(async (entryId: string) => {
    setRevealFor(null);
    try {
      const r = await api.reveal(puzzle.key, entryId);
      setReveals(r.revealsUsed);
      setSlots((cur) => {
        const next = cur.slice();
        for (const p of r.placements) {
          const idx = next.indexOf(p.tile);
          if (idx !== -1) next[idx] = null;
        }
        for (const p of r.placements) next[p.slot] = p.tile; // displaced tiles fall back to the tray
        return next;
      });
      setRot((cur) => {
        const next = { ...cur };
        for (const p of r.placements) next[String(p.tile)] = p.rot;
        return next;
      });
      setLocked((cur) => [...new Set([...cur, ...r.placements.map((p) => p.tile)])]);
      setMessage("");
    } catch (err) {
      setMessage((err as Error).message);
    }
  }, [puzzle.key]);

  const across = puzzle.entries.filter((e) => e.dir === "across");
  const down = puzzle.entries.filter((e) => e.dir === "down");
  const clueList = (title: string, list: typeof across) => (
    <div className="clues">
      <h3>{title}</h3>
      <ul>
        {list.map((e) => (
          <li key={e.id} className={correct.includes(e.id) ? "ok" : ""} data-testid={`clue-${e.id}`}>
            <span className="num">{e.number}</span>
            <span>{e.clue} <em>({e.length})</em></span>
            {!correct.includes(e.id) && !solved && (
              <button className="reveal" title="Reveal this word" onClick={() => setRevealFor(e.id)} disabled={reveals >= 3}>👁</button>
            )}
            {correct.includes(e.id) && <span className="check">✓</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section>
      <h2>{label}</h2>
      <p className="meta">{moves} moves · {reveals}/3 reveals · {correct.length}/{puzzle.entries.length} clues solved</p>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="play">
          <div>
            <div className={`grid ${solved ? "solved" : ""}`}>
              {slots.map((id, i) => (
                <Slot key={i} index={i}>
                  {id !== null && <DraggableTile tile={tileById.get(id)!} turns={turnsOf(id)} locked={locked.includes(id)} onRotate={() => rotateTile(id)} />}
                </Slot>
              ))}
            </div>
            <Tray>
              {trayTiles.map((id) => (
                <DraggableTile key={id} tile={tileById.get(id)!} turns={turnsOf(id)} locked={false} onRotate={() => rotateTile(id)} />
              ))}
              {trayTiles.length === 0 && <span className="hint">All tiles placed</span>}
            </Tray>
            <button onClick={shuffleTray}>Running out of space? Shuffle tiles</button>
          </div>
          <div className="cluecols">
            {clueList("Across", across)}
            {clueList("Down", down)}
          </div>
        </div>
      </DndContext>
      {message && <p className="error">{message}</p>}
      {revealFor && (
        <div className="modal" role="dialog">
          <div>
            <p>Would you like to reveal the word? You can reveal up to 3 words per puzzle ({3 - reveals} left).</p>
            <button onClick={() => doReveal(revealFor)} data-testid="confirm-reveal">Reveal</button>{" "}
            <button onClick={() => setRevealFor(null)}>Cancel</button>
          </div>
        </div>
      )}
      {solved && (
        <div className="win" data-testid="win">
          <strong>Solved! 🎉</strong>
          {share && (
            <>
              <pre>{share}</pre>
              <button onClick={() => navigator.clipboard?.writeText(share)}>Copy result</button>
            </>
          )}
          <p><a href="#/practice">Try a practice puzzle</a> · <a href="#/archive">Browse the archive</a></p>
        </div>
      )}
    </section>
  );
}
