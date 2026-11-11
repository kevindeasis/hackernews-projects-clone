export interface Temple {
  id: number; name: string; deity: string; state: string; city: string;
  tradition: string; lat: number; lng: number; description: string;
}
export interface Filter { q: string; state: string; tradition: string }

const qs = (f: Filter) => {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof Filter)[]).forEach((k) => f[k] && p.set(k, f[k]));
  return p.toString();
};

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export const fetchTemples = (f: Filter) => get<Temple[]>(`/api/temples?${qs(f)}`);
export const fetchRandom = (f: Filter) => get<Temple>(`/api/temples/random?${qs(f)}`);
export const fetchFacets = () => get<{ states: string[]; traditions: string[] }>("/api/facets");
