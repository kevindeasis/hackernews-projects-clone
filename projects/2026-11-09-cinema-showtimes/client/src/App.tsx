import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFilters, getShowtimes, type Query } from "./api";

const today = new Date().toISOString().slice(0, 10);

export default function App() {
  const [q, setQ] = useState<Query>({ date: today });
  const filters = useQuery({ queryKey: ["filters"], queryFn: getFilters });
  const shows = useQuery({ queryKey: ["shows", q], queryFn: () => getShowtimes(q) });
  const set = (k: keyof Query) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setQ((p) => ({ ...p, [k]: e.target.value }));

  const byFilm = new Map<string, NonNullable<typeof shows.data>>();
  shows.data?.forEach((s) => byFilm.set(s.film, [...(byFilm.get(s.film) ?? []), s]));

  return (
    <main>
      <h1>Cinema Showtimes</h1>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <input type="date" value={q.date ?? ""} onChange={set("date")} aria-label="Date" />
        <select value={q.area ?? ""} onChange={set("area")} aria-label="Area">
          <option value="">All areas</option>
          {filters.data?.areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={q.filmId ?? ""} onChange={set("filmId")} aria-label="Film">
          <option value="">All films</option>
          {filters.data?.films.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
        <select value={q.format ?? ""} onChange={set("format")} aria-label="Format">
          <option value="">Any format</option>
          {filters.data?.formats.map((f) => <option key={f}>{f}</option>)}
        </select>
        <input type="time" value={q.after ?? ""} onChange={set("after")} aria-label="Starts after" />
      </form>
      {shows.isLoading && <p>Loading…</p>}
      {shows.isError && <p className="err">Could not load showtimes.</p>}
      {shows.data && shows.data.length === 0 && <p>No showtimes match.</p>}
      {[...byFilm].map(([film, rows]) => (
        <section key={film}>
          <h2>{film}</h2>
          {[...new Set(rows.map((r) => r.cinema))].map((cinema) => (
            <div key={cinema} className="row">
              <span className="cinema">{cinema}</span>
              {rows.filter((r) => r.cinema === cinema).map((r) => (
                <span key={r.id} className="chip">{r.startsAt.slice(11)} <small>{r.format}</small></span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
