export type Status = "detected" | "confirmed" | "rejected";
export interface Tree {
  id: number; lat: number; lng: number; species: string | null;
  canopy_m: number; confidence: number; status: Status; source: string;
}
export interface City { id: number; slug: string; name: string; lat: number; lng: number; zoom: number; trees?: number }
export interface Stats {
  total: number; areaKm2: number; treesPerKm2: number; canopyCover: number; meanCanopyM: number;
  reviewed: number; topSpecies: { species: string; count: number }[];
}
export type Bbox = [number, number, number, number]; // south, west, north, east

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? String(r.status));
  return r.json();
}
const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const fetchCities = () => req<City[]>("/api/cities");
export const fetchTrees = (slug: string, bbox: Bbox, minConfidence: number) =>
  req<Tree[]>(`/api/cities/${slug}/trees?bbox=${bbox.join(",")}&minConfidence=${minConfidence}&limit=8000`);
export const fetchStats = (slug: string, bbox: Bbox) => req<Stats>(`/api/cities/${slug}/stats?bbox=${bbox.join(",")}`);
export const fetchNextReview = (slug: string) => req<Tree>(`/api/cities/${slug}/review/next`);
export const patchTree = (id: number, patch: Partial<Pick<Tree, "status" | "species" | "canopy_m">>) =>
  req<Tree>(`/api/trees/${id}`, json("PATCH", patch));
export const addTree = (slug: string, t: { lat: number; lng: number; species?: string | null; canopy_m?: number }) =>
  req<Tree>(`/api/cities/${slug}/trees`, json("POST", t));
export const importCsv = (slug: string, text: string) =>
  req<{ imported: number; skipped: number }>(`/api/cities/${slug}/import`, {
    method: "POST", headers: { "Content-Type": "text/csv" }, body: text,
  });
