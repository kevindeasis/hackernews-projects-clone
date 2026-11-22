export type Severity = "none" | "mild" | "moderate" | "severe";
export interface Entry { id: number; date: string; meal: string; food: string; allergen: string | null; reaction: Severity; notes: string }
export interface FoodStat { food: string; allergen: string | null; timesEaten: number; firstTried: string; lastTried: string; reactions: number; worstReaction: Severity; reactionRate: number; suspect: boolean }
export interface AllergenStatus { allergen: string; introduced: boolean; firstTried: string | null; timesEaten: number; reactions: number }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : r.json();
}
export const api = {
  entries: () => req<Entry[]>("/api/entries"),
  add: (e: { date: string; meal: string; food: string; reaction: Severity; notes: string }) => req<Entry>("/api/entries", { method: "POST", body: JSON.stringify(e) }),
  setReaction: (id: number, reaction: Severity, notes?: string) => req<Entry>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify({ reaction, notes }) }),
  remove: (id: number) => req<void>(`/api/entries/${id}`, { method: "DELETE" }),
  foods: () => req<FoodStat[]>("/api/foods"),
  allergens: () => req<AllergenStatus[]>("/api/allergens"),
  settings: () => req<{ babyName: string }>("/api/settings"),
  saveSettings: (babyName: string) => req("/api/settings", { method: "PUT", body: JSON.stringify({ babyName }) }),
  report: () => fetch("/api/report").then((r) => r.text()),
};
