export type Kind = "sudoku" | "killer" | "wordsearch";
export type Level = "easy" | "medium" | "hard" | "extreme";
export const KINDS: { id: Kind; label: string }[] = [
  { id: "sudoku", label: "Sudoku" },
  { id: "killer", label: "Killer Sudoku" },
  { id: "wordsearch", label: "Wordsearch" },
];
export const LEVELS: Level[] = ["easy", "medium", "hard", "extreme"];

export interface Cage { cells: number[]; sum: number }
export interface Puzzle {
  id: number; kind: Kind; difficulty: Level; achieved: Level; seed: string;
  givens?: number[]; cages?: Cage[];
  size?: number; theme?: string; grid?: string[] | number[]; words?: string[];
}
export interface Step {
  technique: string; description: string; focus: number[];
  placements: { cell: number; digit: number }[]; eliminations: { cell: number; digit: number }[];
}
export interface Walkthrough { solved: boolean; difficulty: Level; steps: Step[]; solution: number[] }
export interface Book { pages: { page: number; puzzleId: number | null; bestSeconds: number | null }[] }

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  book: (kind: Kind, level: Level) => fetch(`/api/books/${kind}/${level}`).then((r) => j<Book>(r)),
  create: (kind: Kind, difficulty: Level, page?: number) => post("/api/puzzles", { kind, difficulty, page }).then((r) => j<Puzzle>(r)),
  puzzle: (id: number) => fetch(`/api/puzzles/${id}`).then((r) => j<Puzzle>(r)),
  check: (id: number, grid: number[]) =>
    post(`/api/puzzles/${id}/check`, { grid }).then((r) => j<{ complete: boolean; wrong: number[]; conflicts: number[]; filled: number }>(r)),
  select: (id: number, r1: number, c1: number, r2: number, c2: number) =>
    post(`/api/puzzles/${id}/select`, { r1, c1, r2, c2 }).then((r) => j<{ word: string | null }>(r)),
  walkthrough: (id: number) => fetch(`/api/puzzles/${id}/walkthrough`).then((r) => j<Walkthrough>(r)),
  result: (id: number, seconds: number, hints: number) => post(`/api/puzzles/${id}/results`, { seconds, hints }),
  stats: () => fetch("/api/stats").then((r) => j<{ stats: { kind: string; difficulty: string; solved: number; avgSeconds: number; bestSeconds: number }[] }>(r)),
};

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
