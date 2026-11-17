import { describe, expect, it } from "vitest";
import { rngFromString } from "./rng.js";
import { countSolutions, generateSudoku, gridFromString, humanSolve, isValidSolution, conflicts } from "./sudoku.js";
import { cageCombos, countKiller, generateKiller, killerWalkthrough } from "./killer.js";
import { generateWordSearch, matchSelection } from "./wordsearch.js";

const EASY = gridFromString("530070000600195000098000060800060003400803001700020006060000280000419005000080079");

describe("sudoku", () => {
  it("counts solutions and solves a classic puzzle with singles only", () => {
    expect(countSolutions(EASY)).toBe(1);
    const w = humanSolve(EASY);
    expect(w.solved).toBe(true);
    expect(w.difficulty).toBe("easy");
  });
  it("generates a unique, reproducible puzzle", () => {
    const a = generateSudoku("medium", rngFromString("t1"));
    const b = generateSudoku("medium", rngFromString("t1"));
    expect(a.givens).toEqual(b.givens);
    expect(countSolutions(a.givens)).toBe(1);
    expect(isValidSolution(a.solution)).toBe(true);
    expect(conflicts(a.solution)).toEqual([]);
  });
  it("walkthrough steps rebuild the solution", () => {
    const p = generateSudoku("hard", rngFromString("walk"));
    const w = humanSolve(p.givens, undefined, undefined, p.solution);
    const g = p.givens.slice();
    for (const s of w.steps) for (const pl of s.placements) g[pl.cell] = pl.digit;
    expect(g).toEqual(p.solution);
  });
});

describe("killer", () => {
  it("enumerates cage combinations", () => {
    expect(cageCombos(2, 3)).toEqual([[1, 2]]);
    expect(cageCombos(3, 24)).toEqual([[7, 8, 9]]);
    expect(cageCombos(2, 17)).toEqual([[8, 9]]);
  });
  it("generates a uniquely solvable puzzle whose cage sums match", () => {
    const k = generateKiller("easy", rngFromString("k1"));
    expect(countKiller(k.cages, k.givens)).toBe(1);
    for (const c of k.cages) expect(c.cells.reduce((s, x) => s + k.solution[x], 0)).toBe(c.sum);
    expect(new Set(k.cages.flatMap((c) => c.cells)).size).toBe(81);
  });
  it("walkthrough completes", () => {
    const k = generateKiller("medium", rngFromString("k2"));
    expect(killerWalkthrough(k).solved).toBe(true);
  });
});

describe("wordsearch", () => {
  it("places words and finds them in either direction", () => {
    const p = generateWordSearch("medium", rngFromString("w1"));
    expect(p.grid).toHaveLength(p.size);
    const pl = p.placements[0];
    const r2 = pl.row + pl.dr * (pl.word.length - 1);
    const c2 = pl.col + pl.dc * (pl.word.length - 1);
    expect(matchSelection(p, pl.row, pl.col, r2, c2)).toBe(pl.word);
    expect(matchSelection(p, r2, c2, pl.row, pl.col)).toBe(pl.word);
    expect(matchSelection(p, 0, 0, 1, 3)).toBeNull();
  });
});
