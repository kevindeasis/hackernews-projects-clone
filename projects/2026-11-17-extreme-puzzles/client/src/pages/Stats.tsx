import { useQuery } from "@tanstack/react-query";
import { api, fmt } from "../api";

export default function Stats() {
  const q = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  return (
    <section>
      <h1>Your stats</h1>
      {q.data && !q.data.stats.length && <p className="muted">Solve a puzzle to see times here.</p>}
      {!!q.data?.stats.length && (
        <table>
          <thead><tr><th>Puzzle</th><th>Level</th><th>Solved</th><th>Average</th><th>Best</th></tr></thead>
          <tbody>
            {q.data.stats.map((s) => (
              <tr key={s.kind + s.difficulty}><td>{s.kind}</td><td>{s.difficulty}</td><td>{s.solved}</td><td>{fmt(s.avgSeconds)}</td><td>{fmt(s.bestSeconds)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
