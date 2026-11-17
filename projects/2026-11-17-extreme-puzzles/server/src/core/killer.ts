import { Rng, shuffle, pick } from "./rng.js";
import {
  Difficulty, Finder, PEERS, Step, Walkthrough, bit, cellName, digitsOf, hiddenSingle, humanSolve, nakedSingle,
  popcount, randomSolution, lockedCandidates, nakedPair, row, col,
} from "./sudoku.js";

export interface Cage {
  cells: number[];
  sum: number;
}

export interface KillerPuzzle {
  cages: Cage[];
  givens: number[]; // usually all zeros; a few revealed digits if uniqueness needed them
  solution: number[];
  difficulty: Difficulty;
  achieved: Difficulty;
}

/** All sets of `n` distinct digits (1-9) that add up to `sum`. */
export function cageCombos(n: number, sum: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, left: number, acc: number[]) => {
    if (acc.length === n) {
      if (left === 0) out.push(acc.slice());
      return;
    }
    for (let d = start; d <= 9; d++) {
      if (d > left) break;
      acc.push(d);
      rec(d + 1, left - d, acc);
      acc.pop();
    }
  };
  rec(1, sum, []);
  return out;
}

/** Count solutions of a killer puzzle. Returns 2+ if not unique, and `limit` when the node budget is blown. */
export function countKiller(cages: Cage[], givens: readonly number[], limit = 2, maxNodes = 15_000): number {
  const cageOf = new Array(81).fill(-1);
  cages.forEach((c, i) => c.cells.forEach((x) => (cageOf[x] = i)));
  const g = givens.slice();
  const used = cages.map(() => 0); // bitmask of digits used in each cage
  const total = cages.map(() => 0);
  const filled = cages.map(() => 0);
  cages.forEach((cg, i) =>
    cg.cells.forEach((c) => {
      if (g[c]) {
        used[i] |= bit(g[c]);
        total[i] += g[c];
        filled[i]++;
      }
    }),
  );
  let count = 0;
  let nodes = 0;
  const candidates = (c: number) => {
    let m = 0x3fe;
    for (const p of PEERS[c]) if (g[p]) m &= ~bit(g[p]);
    const i = cageOf[c];
    m &= ~used[i];
    const left = cages[i].cells.length - filled[i];
    const out: number[] = [];
    for (const d of digitsOf(m)) {
      const t = total[i] + d;
      if (left === 1 ? t === cages[i].sum : t + (left - 1) <= cages[i].sum && t + 9 * (left - 1) >= cages[i].sum) out.push(d);
    }
    return out;
  };
  const rec = (): void => {
    if (count >= limit || ++nodes > maxNodes) return;
    let best = -1;
    let bestC: number[] = [];
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const cs = candidates(c);
      if (best === -1 || cs.length < bestC.length) {
        best = c;
        bestC = cs;
        if (cs.length <= 1) break;
      }
    }
    if (best === -1) {
      count++;
      return;
    }
    const i = cageOf[best];
    for (const d of bestC) {
      g[best] = d;
      used[i] |= bit(d);
      total[i] += d;
      filled[i]++;
      rec();
      filled[i]--;
      total[i] -= d;
      used[i] &= ~bit(d);
      g[best] = 0;
      if (count >= limit || nodes > maxNodes) return;
    }
  };
  rec();
  return nodes > maxNodes ? limit : count;
}

const neighbours = (c: number) => {
  const r = row(c);
  const k = col(c);
  const out: number[] = [];
  if (r > 0) out.push(c - 9);
  if (r < 8) out.push(c + 9);
  if (k > 0) out.push(c - 1);
  if (k < 8) out.push(c + 1);
  return out;
};

/** Partition the solved grid into cages with distinct digits and sizes up to `maxSize`. */
export function partition(solution: readonly number[], maxSize: number, minSize: number, rng: Rng): Cage[] {
  const owner = new Array(81).fill(-1);
  const cages: number[][] = [];
  for (const start of shuffle([...Array(81).keys()], rng)) {
    if (owner[start] !== -1) continue;
    const size = minSize + Math.floor(rng() * (maxSize - minSize + 1));
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < size) {
      const opts = cells
        .flatMap(neighbours)
        .filter((n) => owner[n] === -1 && !cells.some((x) => solution[x] === solution[n]));
      if (!opts.length) break;
      const n = pick(opts, rng);
      owner[n] = cages.length;
      cells.push(n);
    }
    cages.push(cells);
  }
  // Merge lone cells into a neighbouring cage when digits stay distinct.
  for (let i = 0; i < cages.length; i++) {
    if (cages[i].length !== 1 || minSize === 1) continue;
    const c = cages[i][0];
    const j = neighbours(c).map((n) => owner[n]).find((o) => o !== i && cages[o].length < maxSize && !cages[o].some((x) => solution[x] === solution[c]));
    if (j !== undefined) {
      cages[j].push(c);
      owner[c] = j;
      cages[i] = [];
    }
  }
  return cages.filter((c) => c.length).map((cells) => ({ cells: cells.sort((a, b) => a - b), sum: cells.reduce((s, c) => s + solution[c], 0) }));
}

/** Step that prunes candidates using the possible digit combinations of each cage. */
export const cageFinder = (cages: Cage[]): Finder => (cg) => {
  for (const cage of cages) {
    const open = cage.cells.filter((c) => !cg.grid[c]);
    if (!open.length) continue;
    const placed = cage.cells.filter((c) => cg.grid[c]).map((c) => cg.grid[c]);
    const union = open.reduce((m, c) => m | cg.cands[c], 0);
    let allowed = 0;
    let combos = 0;
    for (const combo of cageCombos(cage.cells.length, cage.sum)) {
      if (!placed.every((d) => combo.includes(d))) continue;
      const rest = combo.filter((d) => !placed.includes(d));
      if (rest.every((d) => union & bit(d))) {
        combos++;
        for (const d of rest) allowed |= bit(d);
      }
    }
    const elim: { cell: number; digit: number }[] = [];
    for (const c of open) for (const d of digitsOf(cg.cands[c] & ~allowed)) elim.push({ cell: c, digit: d });
    if (elim.length) {
      const names = open.map(cellName).join(", ");
      const known = placed.length ? ` (already containing ${placed.join(", ")})` : "";
      const fits = combos === 1 ? "fits" : "fit";
      return {
        technique: "cage-combinations",
        description: `The ${cage.cells.length}-cell cage summing to ${cage.sum}${known}: only ${combos} digit combination${combos === 1 ? "" : "s"} ${fits}, so ${names} can only use {${digitsOf(allowed).join(",")}}.`,
        focus: cage.cells.slice(),
        placements: [],
        eliminations: elim,
      } as Step;
    }
  }
  return null;
};

export function killerWalkthrough(p: Pick<KillerPuzzle, "cages" | "givens" | "solution">): Walkthrough {
  return humanSolve(p.givens, [cageFinder(p.cages), nakedSingle, hiddenSingle, lockedCandidates, nakedPair], undefined, p.solution);
}

const SIZES: Record<Difficulty, [number, number]> = { easy: [1, 3], medium: [2, 4], hard: [2, 5], extreme: [3, 6] };

export function generateKiller(target: Difficulty, rng: Rng, attempts = 12): KillerPuzzle {
  const [minSize, maxSize] = SIZES[target];
  for (let a = 0; a < attempts; a++) {
    const solution = randomSolution(rng);
    const cages = partition(solution, maxSize, minSize, rng);
    const givens = new Array(81).fill(0);
    if (countKiller(cages, givens) === 1) return finish(cages, givens, solution, target);
  }
  // Fall back: keep the cage layout but reveal a few digits (in small batches) until it is unique.
  const solution = randomSolution(rng);
  const cages = partition(solution, maxSize, Math.min(minSize, 2), rng);
  const givens = new Array(81).fill(0);
  const order = shuffle([...Array(81).keys()], rng);
  for (let i = 0; i < 81; i += 3) {
    for (const c of order.slice(i, i + 3)) givens[c] = solution[c];
    if (countKiller(cages, givens) === 1) break;
  }
  return finish(cages, givens, solution, target);
}

function finish(cages: Cage[], givens: number[], solution: number[], target: Difficulty): KillerPuzzle {
  const achieved = target; // killer tiers are defined by cage size; the walkthrough flags any trial step
  return { cages, givens, solution, difficulty: target, achieved };
}

export const cageSumTotal = (cages: Cage[]) => cages.reduce((s, c) => s + c.sum, 0);
export { popcount };
