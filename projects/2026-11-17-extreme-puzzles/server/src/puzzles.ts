import type { Db } from "./db.js";
import { rngFromString } from "./core/rng.js";
import { Difficulty, LEVELS, generateSudoku } from "./core/sudoku.js";
import { generateKiller } from "./core/killer.js";
import { generateWordSearch } from "./core/wordsearch.js";

export type Kind = "sudoku" | "killer" | "wordsearch";
export const KINDS: Kind[] = ["sudoku", "killer", "wordsearch"];
export const BOOK_SIZE = 20;
export { LEVELS };
export type { Difficulty };

export interface PuzzleRow {
  id: number;
  kind: Kind;
  difficulty: Difficulty;
  seed: string;
  data: string;
  solution: string;
  achieved: Difficulty;
}

/** Build a puzzle deterministically from (kind, difficulty, seed). */
export function build(kind: Kind, difficulty: Difficulty, seed: string) {
  const rng = rngFromString(`${kind}:${difficulty}:${seed}`);
  if (kind === "sudoku") {
    const p = generateSudoku(difficulty, rng);
    return { data: { givens: p.givens }, solution: p.solution, achieved: p.achieved };
  }
  if (kind === "killer") {
    const p = generateKiller(difficulty, rng);
    return { data: { givens: p.givens, cages: p.cages }, solution: p.solution, achieved: p.achieved };
  }
  const p = generateWordSearch(difficulty, rng);
  return { data: { size: p.size, theme: p.theme, grid: p.grid, words: p.words }, solution: p.placements, achieved: difficulty };
}

export function getOrCreate(db: Db, kind: Kind, difficulty: Difficulty, seed: string): PuzzleRow {
  const found = db.prepare("SELECT * FROM puzzles WHERE kind=? AND difficulty=? AND seed=?").get(kind, difficulty, seed) as PuzzleRow | undefined;
  if (found) return found;
  const b = build(kind, difficulty, seed);
  const info = db
    .prepare("INSERT INTO puzzles (kind, difficulty, seed, data, solution, achieved) VALUES (?,?,?,?,?,?)")
    .run(kind, difficulty, seed, JSON.stringify(b.data), JSON.stringify(b.solution), b.achieved);
  return db.prepare("SELECT * FROM puzzles WHERE id=?").get(info.lastInsertRowid) as PuzzleRow;
}

export const publicView = (r: PuzzleRow) => ({
  id: r.id,
  kind: r.kind,
  difficulty: r.difficulty,
  achieved: r.achieved,
  seed: r.seed,
  ...JSON.parse(r.data),
});
