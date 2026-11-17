import { Rng, shuffle } from "./rng.js";

export type Difficulty = "easy" | "medium" | "hard" | "extreme";
export const LEVELS: Difficulty[] = ["easy", "medium", "hard", "extreme"];
const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, extreme: 3 };

export type Technique =
  | "naked-single"
  | "hidden-single"
  | "locked-candidates"
  | "naked-pair"
  | "cage-combinations"
  | "trial";

export interface Step {
  technique: Technique;
  description: string;
  /** cells (0..80) that are the focus of the step */
  focus: number[];
  placements: { cell: number; digit: number }[];
  eliminations: { cell: number; digit: number }[];
}

export interface Walkthrough {
  solved: boolean;
  difficulty: Difficulty;
  steps: Step[];
}

export const cellName = (c: number) => `R${Math.floor(c / 9) + 1}C${(c % 9) + 1}`;
const row = (c: number) => Math.floor(c / 9);
const col = (c: number) => c % 9;
const box = (c: number) => Math.floor(row(c) / 3) * 3 + Math.floor(col(c) / 3);

export const UNITS: number[][] = (() => {
  const u: number[][] = [];
  for (let i = 0; i < 9; i++) u.push(Array.from({ length: 9 }, (_, j) => i * 9 + j)); // rows
  for (let i = 0; i < 9; i++) u.push(Array.from({ length: 9 }, (_, j) => j * 9 + i)); // cols
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3;
    const c0 = (b % 3) * 3;
    u.push(Array.from({ length: 9 }, (_, j) => (r0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)));
  }
  return u;
})();
const unitName = (i: number) => (i < 9 ? `row ${i + 1}` : i < 18 ? `column ${i - 8}` : `box ${i - 17}`);

export const PEERS: number[][] = Array.from({ length: 81 }, (_, c) => {
  const s = new Set<number>();
  for (const u of UNITS) if (u.includes(c)) u.forEach((x) => x !== c && s.add(x));
  return [...s];
});

const ALL = 0x3fe; // bits 1..9
const bit = (d: number) => 1 << d;
const digitsOf = (m: number) => {
  const r: number[] = [];
  for (let d = 1; d <= 9; d++) if (m & bit(d)) r.push(d);
  return r;
};
const popcount = (m: number) => digitsOf(m).length;

/** Count solutions of a plain sudoku (stops at `limit`). */
export function countSolutions(grid: readonly number[], limit = 2): number {
  const g = grid.slice();
  let count = 0;
  const cands = (c: number) => {
    let m = ALL;
    for (const p of PEERS[c]) if (g[p]) m &= ~bit(g[p]);
    return m;
  };
  const rec = (): void => {
    if (count >= limit) return;
    let best = -1;
    let bestM = 0;
    let bestN = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const m = cands(c);
      const n = popcount(m);
      if (n < bestN) {
        best = c;
        bestM = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best === -1) {
      count++;
      return;
    }
    for (const d of digitsOf(bestM)) {
      g[best] = d;
      rec();
      if (count >= limit) break;
    }
    g[best] = 0;
  };
  rec();
  return count;
}

/** A random, fully solved grid. */
export function randomSolution(rng: Rng): number[] {
  const g = new Array(81).fill(0);
  const fill = (): boolean => {
    let best = -1;
    let bestM = 0;
    let bestN = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      let m = ALL;
      for (const p of PEERS[c]) if (g[p]) m &= ~bit(g[p]);
      const n = popcount(m);
      if (n < bestN) {
        best = c;
        bestM = m;
        bestN = n;
      }
    }
    if (best === -1) return true;
    for (const d of shuffle(digitsOf(bestM), rng)) {
      g[best] = d;
      if (fill()) return true;
    }
    g[best] = 0;
    return false;
  };
  fill();
  return g;
}

/**
 * Candidate state shared by the plain-sudoku and killer human solvers.
 * `extra` lets the killer solver add cage-based pruning between standard techniques.
 */
export class CandidateGrid {
  cands: number[] = new Array(81).fill(0);
  grid: number[];
  constructor(grid: readonly number[]) {
    this.grid = grid.slice();
    for (let c = 0; c < 81; c++) this.cands[c] = this.grid[c] ? 0 : ALL;
    for (let c = 0; c < 81; c++) if (this.grid[c]) this.eliminateFromPeers(c, this.grid[c]);
  }
  eliminateFromPeers(c: number, d: number) {
    for (const p of PEERS[c]) this.cands[p] &= ~bit(d);
  }
  place(c: number, d: number) {
    this.grid[c] = d;
    this.cands[c] = 0;
    this.eliminateFromPeers(c, d);
  }
  has(c: number, d: number) {
    return (this.cands[c] & bit(d)) !== 0;
  }
  get solved() {
    return this.grid.every((v) => v);
  }
}

export type Finder = (cg: CandidateGrid) => Step | null;

export const nakedSingle: Finder = (cg) => {
  for (let c = 0; c < 81; c++) {
    if (!cg.grid[c] && popcount(cg.cands[c]) === 1) {
      const d = digitsOf(cg.cands[c])[0];
      return {
        technique: "naked-single",
        description: `${cellName(c)} can only be ${d}: every other digit already appears in its row, column or box.`,
        focus: [c],
        placements: [{ cell: c, digit: d }],
        eliminations: [],
      };
    }
  }
  return null;
};

export const hiddenSingle: Finder = (cg) => {
  for (let u = 0; u < UNITS.length; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((c) => !cg.grid[c] && cg.has(c, d));
      const placed = UNITS[u].some((c) => cg.grid[c] === d);
      if (!placed && spots.length === 1) {
        return {
          technique: "hidden-single",
          description: `In ${unitName(u)}, ${d} can only go in ${cellName(spots[0])}.`,
          focus: UNITS[u].slice(),
          placements: [{ cell: spots[0], digit: d }],
          eliminations: [],
        };
      }
    }
  }
  return null;
};

export const lockedCandidates: Finder = (cg) => {
  for (let u = 0; u < UNITS.length; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((c) => !cg.grid[c] && cg.has(c, d));
      if (spots.length < 2 || spots.length > 3) continue;
      // find another unit containing all spots, then clear d from its other cells
      for (let v = 0; v < UNITS.length; v++) {
        if (v === u || !spots.every((c) => UNITS[v].includes(c))) continue;
        const elim = UNITS[v].filter((c) => !UNITS[u].includes(c) && !cg.grid[c] && cg.has(c, d));
        if (elim.length) {
          return {
            technique: "locked-candidates",
            description: `In ${unitName(u)}, ${d} must be in ${spots.map(cellName).join("/")}, all inside ${unitName(v)}, so ${d} is removed from the rest of ${unitName(v)}.`,
            focus: spots,
            placements: [],
            eliminations: elim.map((cell) => ({ cell, digit: d })),
          };
        }
      }
    }
  }
  return null;
};

export const nakedPair: Finder = (cg) => {
  for (let u = 0; u < UNITS.length; u++) {
    const cells = UNITS[u].filter((c) => !cg.grid[c] && popcount(cg.cands[c]) === 2);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (cg.cands[cells[i]] !== cg.cands[cells[j]]) continue;
        const m = cg.cands[cells[i]];
        const elim: { cell: number; digit: number }[] = [];
        for (const c of UNITS[u]) {
          if (c === cells[i] || c === cells[j] || cg.grid[c]) continue;
          for (const d of digitsOf(m & cg.cands[c])) elim.push({ cell: c, digit: d });
        }
        if (elim.length) {
          const [a, b] = digitsOf(m);
          return {
            technique: "naked-pair",
            description: `${cellName(cells[i])} and ${cellName(cells[j])} both hold only {${a},${b}}, so ${a} and ${b} are removed from the rest of ${unitName(u)}.`,
            focus: [cells[i], cells[j]],
            placements: [],
            eliminations: elim,
          };
        }
      }
    }
  }
  return null;
};

export function applyStep(cg: CandidateGrid, s: Step) {
  for (const e of s.eliminations) cg.cands[e.cell] &= ~bit(e.digit);
  for (const p of s.placements) cg.place(p.cell, p.digit);
}

const TECH_LEVEL: Record<string, Difficulty> = {
  "naked-single": "easy",
  "hidden-single": "medium",
  "locked-candidates": "hard",
  "naked-pair": "hard",
  "cage-combinations": "easy",
  trial: "extreme",
};

/** Solve like a person: apply the cheapest technique that makes progress, recording each step. */
export function humanSolve(
  grid: readonly number[],
  finders: Finder[] = [nakedSingle, hiddenSingle, lockedCandidates, nakedPair],
  setup?: (cg: CandidateGrid) => void,
  solution?: readonly number[],
): Walkthrough {
  const cg = new CandidateGrid(grid);
  setup?.(cg);
  const steps: Step[] = [];
  let hardest = 0;
  for (let guard = 0; guard < 2000 && !cg.solved; guard++) {
    let step: Step | null = null;
    for (const f of finders) {
      step = f(cg);
      if (step) break;
    }
    if (!step) break;
    applyStep(cg, step);
    steps.push(step);
    hardest = Math.max(hardest, RANK[TECH_LEVEL[step.technique]]);
  }
  let solved = cg.solved;
  if (!solved && solution) {
    // Stuck: the puzzle needs trial-and-error. Reveal the rest as one trial step so the walkthrough still finishes.
    const placements = cg.grid.map((v, cell) => ({ cell, digit: solution[cell] })).filter((p) => !cg.grid[p.cell]);
    steps.push({
      technique: "trial",
      description: `No further simple deduction exists. Try a candidate and follow its consequences (here the remaining ${placements.length} cells are revealed from the solution).`,
      focus: placements.map((p) => p.cell),
      placements,
      eliminations: [],
    });
    hardest = 3;
    solved = true;
  }
  return { solved, difficulty: (Object.keys(RANK) as Difficulty[])[hardest], steps };
}

export interface SudokuPuzzle {
  givens: number[];
  solution: number[];
  difficulty: Difficulty;
  achieved: Difficulty;
}

const CLUE_TARGET: Record<Difficulty, number> = { easy: 40, medium: 33, hard: 28, extreme: 0 };

export function generateSudoku(target: Difficulty, rng: Rng, attempts = 25): SudokuPuzzle {
  let best: SudokuPuzzle | null = null;
  for (let a = 0; a < attempts; a++) {
    const solution = randomSolution(rng);
    const givens = solution.slice();
    let clues = 81;
    for (const c of shuffle([...Array(81).keys()], rng)) {
      if (clues <= CLUE_TARGET[target]) break;
      const keep = givens[c];
      givens[c] = 0;
      let ok = countSolutions(givens, 2) === 1;
      if (ok && target !== "extreme") {
        // never exceed the target difficulty
        ok = RANK[humanSolve(givens, undefined, undefined, solution).difficulty] <= RANK[target];
      }
      if (ok) clues--;
      else givens[c] = keep;
    }
    const achieved = humanSolve(givens, undefined, undefined, solution).difficulty;
    const candidate = { givens, solution, difficulty: target, achieved };
    if (!best || Math.abs(RANK[achieved] - RANK[target]) < Math.abs(RANK[best.achieved] - RANK[target])) best = candidate;
    if (achieved === target) return candidate;
  }
  return best!;
}

export const isValidSolution = (g: readonly number[]) =>
  g.length === 81 && UNITS.every((u) => new Set(u.map((c) => g[c])).size === 9 && u.every((c) => g[c] >= 1 && g[c] <= 9));

/** Cells whose value clashes with a peer. */
export function conflicts(g: readonly number[]): number[] {
  return [...Array(81).keys()].filter((c) => g[c] && PEERS[c].some((p) => g[p] === g[c]));
}

export const gridFromString = (s: string) => [...s].map((ch) => (ch >= "1" && ch <= "9" ? Number(ch) : 0));
export { digitsOf, bit, popcount, box, row, col };
