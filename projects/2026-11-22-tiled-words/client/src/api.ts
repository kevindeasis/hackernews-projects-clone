export interface PublicTile { id: number; cells: string[][] }
export interface ClueEntry { id: string; number: number; dir: "across" | "down"; row: number; col: number; length: number; clue: string }
export interface PuzzleData { key: string; size: number; tiles: PublicTile[]; tray: number[]; entries: ClueEntry[] }
export interface SlotPayload { tile: number; rot: number }
export interface SavedState { slots: (number | null)[]; rot: Record<string, number>; locked: number[] }

export function clientId(): string {
  try {
    let id = localStorage.getItem("tw-client-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("tw-client-id", id);
    }
    return id;
  } catch {
    return "anonymous-session";
  }
}

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Request failed");
  return body as T;
}

export const api = {
  puzzle: (key: string) => req<PuzzleData>(key === "daily" ? `/api/puzzles/daily?date=${localToday()}` : `/api/puzzles/${key}`),
  archive: (page: number) => req<{ page: number; pages: number; items: { key: string; completed: boolean }[] }>(`/api/archive?page=${page}&today=${localToday()}&clientId=${clientId()}`),
  stats: () => req<{ current: number; best: number; played: number }>(`/api/stats?clientId=${clientId()}&today=${localToday()}`),
  progress: (key: string) => req<{ state: SavedState | null; reveals: number; moves: number; completed: boolean }>(`/api/progress/${key}?clientId=${clientId()}`),
  saveProgress: (key: string, state: SavedState, moves: number) => req<void>(`/api/progress/${key}`, { method: "PUT", body: JSON.stringify({ clientId: clientId(), state, moves }) }),
  check: (key: string, slots: (SlotPayload | null)[], moves: number) =>
    req<{ solved: boolean; correctEntries: string[]; share?: string }>(`/api/puzzles/${key}/check`, { method: "POST", body: JSON.stringify({ slots, clientId: clientId(), moves }) }),
  reveal: (key: string, entryId: string) =>
    req<{ placements: { tile: number; slot: number; rot: number }[]; revealsUsed: number }>(`/api/puzzles/${key}/reveal`, { method: "POST", body: JSON.stringify({ clientId: clientId(), entryId }) }),
};
