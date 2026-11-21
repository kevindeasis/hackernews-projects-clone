export interface Station { id: string; name: string }
export interface Leg {
  mode: "train" | "walk"; from: string; to: string; fromName: string; toName: string;
  depLabel: string; arrLabel: string; routeName?: string; operator?: string; stopsPassed?: string[];
}
export interface Journey { depLabel: string; arrLabel: string; duration: number; changes: number; legs: Leg[] }

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}
export const fetchStations = () => get<Station[]>("/api/stations");
export const fetchJourneys = (p: { from: string; to: string; depart: string; maxChanges: number }) =>
  get<{ journeys: Journey[] }>(`/api/journeys?${new URLSearchParams({ ...p, maxChanges: String(p.maxChanges) })}`).then((r) => r.journeys);
