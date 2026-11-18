export interface Competition { id: number; slug: string; title: string; description: string; criteria: string[]; product_count?: number }
export interface Product { id: number; name: string; url: string; tagline: string; description: string }
export interface Evaluation { judge_id: string; scores: Record<string, number>; overall: number; rationale: string }
export interface Row { product: Product; rank: number | null; mean: number | null; stdev: number | null; borda: number; judges: number; evaluations: Evaluation[] }
export interface Judge { id: string; name: string; persona: string }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  competitions: () => req<Competition[]>("/competitions"),
  judges: () => req<Judge[]>("/judges"),
  competition: (slug: string) => req<{ competition: Competition; leaderboard: Row[] }>(`/competitions/${slug}`),
  createCompetition: (b: { title: string; description: string; criteria?: string[] }) => req<Competition>("/competitions", { method: "POST", body: JSON.stringify(b) }),
  addProduct: (slug: string, b: Omit<Product, "id">) => req<Product>(`/competitions/${slug}/products`, { method: "POST", body: JSON.stringify(b) }),
  evaluate: (slug: string) => req<{ evaluated: number }>(`/competitions/${slug}/evaluate`, { method: "POST" }),
  deleteProduct: (id: number) => req<void>(`/products/${id}`, { method: "DELETE" }),
};
