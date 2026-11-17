import { Rng, shuffle } from "./rng.js";
import type { Difficulty } from "./sudoku.js";

export interface Placement {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

export interface WordSearchPuzzle {
  size: number;
  theme: string;
  grid: string[]; // rows of letters
  words: string[];
  placements: Placement[]; // the answer key
}

export const THEMES: Record<string, string[]> = {
  space: ["ORBIT", "COMET", "GALAXY", "NEBULA", "PLANET", "ROCKET", "SATURN", "METEOR", "ECLIPSE", "QUASAR", "PULSAR", "COSMOS", "LUNAR", "SOLAR", "ASTEROID", "GRAVITY", "VOYAGER", "APOLLO", "MARS", "VENUS", "JUPITER", "NEPTUNE", "URANUS", "MERCURY", "TELESCOPE", "STARDUST", "SUPERNOVA", "HORIZON"],
  kitchen: ["WHISK", "SPATULA", "COLANDER", "SKILLET", "LADLE", "GRATER", "TONGS", "KETTLE", "BLENDER", "OVEN", "TOASTER", "PEELER", "MORTAR", "PESTLE", "CLEAVER", "SAUCEPAN", "STRAINER", "MIXER", "TRAY", "CASSEROLE", "RAMEKIN", "STOCKPOT", "TEAPOT", "APRON", "MITTEN", "FREEZER", "PANTRY", "CUTLERY"],
  animals: ["TIGER", "ZEBRA", "PANDA", "LLAMA", "OTTER", "BADGER", "FALCON", "GIRAFFE", "DOLPHIN", "PENGUIN", "LEOPARD", "GORILLA", "OCTOPUS", "HEDGEHOG", "CHEETAH", "BISON", "KOALA", "LEMUR", "MEERKAT", "WALRUS", "LOBSTER", "PELICAN", "RACCOON", "JAGUAR", "ANTELOPE", "MANATEE", "TORTOISE", "IGUANA"],
  coding: ["COMPILER", "VARIABLE", "FUNCTION", "ARRAY", "STRING", "BOOLEAN", "LOOP", "CLASS", "OBJECT", "MODULE", "PACKAGE", "DEBUGGER", "SYNTAX", "RUNTIME", "BINARY", "CURSOR", "GIT", "BRANCH", "COMMIT", "MERGE", "SERVER", "CLIENT", "SOCKET", "QUERY", "SCHEMA", "CACHE", "THREAD", "ASYNC"],
};

const DIRS_BY_LEVEL: Record<Difficulty, [number, number][]> = {
  easy: [[0, 1], [1, 0]],
  medium: [[0, 1], [1, 0], [1, 1]],
  hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
  extreme: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
};
const SIZE: Record<Difficulty, number> = { easy: 10, medium: 13, hard: 16, extreme: 20 };
const WORDS: Record<Difficulty, number> = { easy: 8, medium: 12, hard: 16, extreme: 22 };

export function generateWordSearch(level: Difficulty, rng: Rng, themeName?: string): WordSearchPuzzle {
  const names = Object.keys(THEMES);
  const theme = themeName && THEMES[themeName] ? themeName : names[Math.floor(rng() * names.length)];
  const size = SIZE[level];
  const dirs = DIRS_BY_LEVEL[level];
  const grid: string[][] = Array.from({ length: size }, () => new Array(size).fill(""));
  const placements: Placement[] = [];
  const candidates = shuffle(THEMES[theme].filter((w) => w.length <= size), rng).slice(0, WORDS[level]);
  // Longest first gives the best packing.
  for (const word of candidates.sort((a, b) => b.length - a.length)) {
    for (let tries = 0; tries < 200; tries++) {
      const [dr, dc] = dirs[Math.floor(rng() * dirs.length)];
      const r = Math.floor(rng() * size);
      const c = Math.floor(rng() * size);
      const er = r + dr * (word.length - 1);
      const ec = c + dc * (word.length - 1);
      if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
      let ok = true;
      for (let i = 0; i < word.length && ok; i++) {
        const cell = grid[r + dr * i][c + dc * i];
        ok = cell === "" || cell === word[i];
      }
      if (!ok) continue;
      for (let i = 0; i < word.length; i++) grid[r + dr * i][c + dc * i] = word[i];
      placements.push({ word, row: r, col: c, dr, dc });
      break;
    }
  }
  const placed = placements.map((p) => p.word);
  // Extreme puzzles fill with letters drawn from the placed words, which makes decoys much more convincing.
  const pool = level === "extreme" || level === "hard" ? placed.join("") : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = pool[Math.floor(rng() * pool.length)];
  return { size, theme, grid: grid.map((r) => r.join("")), words: placed.slice().sort(), placements };
}

/** Does the straight line from (r1,c1) to (r2,c2) spell one of the placed words (either direction)? */
export function matchSelection(p: WordSearchPuzzle, r1: number, c1: number, r2: number, c2: number): string | null {
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
  if (Math.abs(r2 - r1) !== 0 && Math.abs(c2 - c1) !== 0 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
  let s = "";
  for (let i = 0; i < len; i++) s += p.grid[r1 + dr * i]?.[c1 + dc * i] ?? "?";
  const rev = [...s].reverse().join("");
  return p.words.find((w) => w === s || w === rev) ?? null;
}
