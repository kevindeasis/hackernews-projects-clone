export interface Filters {
  areas: string[];
  cinemas: { id: number; name: string; area: string }[];
  films: { id: number; title: string; runtimeMin: number | null }[];
  formats: string[];
}
export interface Showtime {
  id: number;
  startsAt: string;
  format: string;
  cinema: string;
  area: string;
  film: string;
  runtimeMin: number | null;
}
export type Query = Partial<Record<"area" | "cinemaId" | "filmId" | "format" | "date" | "after", string>>;

export async function getFilters(): Promise<Filters> {
  const r = await fetch("/api/filters");
  if (!r.ok) throw new Error("Failed to load filters");
  return r.json();
}
export async function getShowtimes(q: Query): Promise<Showtime[]> {
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
  const r = await fetch(`/api/showtimes?${params}`);
  if (!r.ok) throw new Error("Failed to load showtimes");
  return r.json();
}
