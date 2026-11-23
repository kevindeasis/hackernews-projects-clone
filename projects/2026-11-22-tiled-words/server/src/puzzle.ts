import { CLUE_BANK, type ClueEntry } from "./clues.js";

export const SIZE = 9; // crossword is SIZE x SIZE
export const TILE = 3; // cut into TILE x TILE tiles -> (SIZE/TILE)^2 tiles
export const TILES_PER_SIDE = SIZE / TILE;
export const BLOCK = "#";

export type Dir = "across" | "down";
export type Grid = string[][];

export interface Placed {
  word: string;
  clue: string;
  row: number;
  col: number;
  dir: Dir;
}

export interface Entry {
  id: string; // e.g. "3A", "5D"
  number: number;
  dir: Dir;
  row: number;
  col: number;
  length: number;
  clue: string;
  answer: string;
}

export interface PublicTile {
  id: number;
  cells: string[][]; // TILE x TILE, already rotated by the scramble
}

export interface Puzzle {
  key: string;
  solution: Grid;
  entries: Entry[];
  tiles: PublicTile[];
  tray: number[]; // initial shuffled order
  /** Extra clockwise quarter-turns each tile needs to be correct. */
  correctRot: number[];
}

export interface SlotState {
  tile: number;
  rot: number; // quarter turns clockwise applied by the player
}

// ---------- seeded randomness ----------
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- crossword generation ----------
const emptyGrid = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill(""));

interface Working {
  grid: Grid;
  usedAcross: boolean[][];
  usedDown: boolean[][];
  placed: Placed[];
}

function canPlace(w: Working, word: string, row: number, col: number, dir: Dir): { ok: boolean; crossings: number } {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;
  const endR = row + dr * (word.length - 1);
  const endC = col + dc * (word.length - 1);
  if (endR >= SIZE || endC >= SIZE) return { ok: false, crossings: 0 };
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= SIZE || c >= SIZE ? "" : w.grid[r][c]);
  if (at(row - dr, col - dc) !== "" || at(endR + dr, endC + dc) !== "") return { ok: false, crossings: 0 };
  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cell = w.grid[r][c];
    if (cell !== "") {
      if (cell !== word[i]) return { ok: false, crossings: 0 };
      const used = dir === "across" ? w.usedAcross[r][c] : w.usedDown[r][c];
      if (used) return { ok: false, crossings: 0 };
      crossings++;
    } else if (at(r + dc, c + dr) !== "" || at(r - dc, c - dr) !== "") {
      // a new letter must not touch letters sideways (would create accidental words)
      return { ok: false, crossings: 0 };
    }
  }
  return { ok: true, crossings };
}

function place(w: Working, e: ClueEntry, row: number, col: number, dir: Dir) {
  for (let i = 0; i < e.word.length; i++) {
    const r = row + (dir === "down" ? i : 0);
    const c = col + (dir === "across" ? i : 0);
    w.grid[r][c] = e.word[i];
    (dir === "across" ? w.usedAcross : w.usedDown)[r][c] = true;
  }
  w.placed.push({ word: e.word, clue: e.clue, row, col, dir });
}

function attempt(bank: ClueEntry[], rnd: () => number, maxWords: number): Working {
  const w: Working = {
    grid: emptyGrid(),
    usedAcross: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
    usedDown: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
    placed: [],
  };
  const words = shuffle(bank.filter((e) => e.word.length <= SIZE), rnd);
  // Seed with a long word across the middle.
  const first = words.find((e) => e.word.length >= 6) ?? words[0];
  place(w, first, Math.floor(SIZE / 2), Math.floor((SIZE - first.word.length) / 2), "across");
  for (const e of words) {
    if (w.placed.length >= maxWords) break;
    if (w.placed.some((p) => p.word === e.word)) continue;
    const cands: { r: number; c: number; dir: Dir; crossings: number }[] = [];
    for (const dir of ["across", "down"] as Dir[]) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const res = canPlace(w, e.word, r, c, dir);
          if (res.ok && res.crossings >= 1) cands.push({ r, c, dir, crossings: res.crossings });
        }
      }
    }
    if (cands.length === 0) continue;
    // Prefer more crossings (denser grids) but keep some randomness.
    cands.sort((a, b) => b.crossings - a.crossings);
    const top = cands.slice(0, Math.max(1, Math.ceil(cands.length / 4)));
    const pick = top[Math.floor(rnd() * top.length)];
    place(w, e, pick.r, pick.c, pick.dir);
  }
  return w;
}

export function generateCrossword(seed: string, bank: ClueEntry[] = CLUE_BANK) {
  const rnd = mulberry32(hashString(seed));
  let best: Working | null = null;
  const score = (w: Working) => w.placed.length * 100 + w.grid.flat().filter((x) => x !== "").length;
  for (let i = 0; i < 40; i++) {
    const w = attempt(bank, rnd, 14);
    if (!best || score(w) > score(best)) best = w;
  }
  return best!;
}

/** Derive numbered entries from a filled grid ("" = block). */
export function deriveEntries(grid: Grid, placed: Placed[]): Entry[] {
  const filled = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && grid[r][c] !== "";
  const entries: Entry[] = [];
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!filled(r, c)) continue;
      const startsAcross = !filled(r, c - 1) && filled(r, c + 1);
      const startsDown = !filled(r - 1, c) && filled(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      n++;
      for (const [dir, starts] of [["across", startsAcross], ["down", startsDown]] as [Dir, boolean][]) {
        if (!starts) continue;
        let len = 0;
        let answer = "";
        while (filled(r + (dir === "down" ? len : 0), c + (dir === "across" ? len : 0))) {
          answer += grid[r + (dir === "down" ? len : 0)][c + (dir === "across" ? len : 0)];
          len++;
        }
        const p = placed.find((x) => x.row === r && x.col === c && x.dir === dir);
        entries.push({
          id: `${n}${dir === "across" ? "A" : "D"}`,
          number: n,
          dir,
          row: r,
          col: c,
          length: len,
          answer,
          clue: p?.clue ?? "(no clue)",
        });
      }
    }
  }
  return entries;
}

// ---------- tiles ----------
export function rotateCW<T>(m: T[][]): T[][] {
  const n = m.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => m[n - 1 - c][r]));
}

export function rotate<T>(m: T[][], turns: number): T[][] {
  let out = m;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = rotateCW(out);
  return out;
}

export function cutTiles(solution: Grid): string[][][] {
  const tiles: string[][][] = [];
  for (let tr = 0; tr < TILES_PER_SIDE; tr++) {
    for (let tc = 0; tc < TILES_PER_SIDE; tc++) {
      tiles.push(
        Array.from({ length: TILE }, (_, r) =>
          Array.from({ length: TILE }, (_, c) => solution[tr * TILE + r][tc * TILE + c] || BLOCK),
        ),
      );
    }
  }
  return tiles;
}

/** Build the full puzzle for a key (a date like 2026-11-22, or "practice-abc123"). Deterministic. */
export function buildPuzzle(key: string): Puzzle {
  const w = generateCrossword(key);
  const entries = deriveEntries(w.grid, w.placed);
  const rnd = mulberry32(hashString(`scramble:${key}`));
  const cut = cutTiles(w.grid);
  const correctRot: number[] = [];
  const tiles: PublicTile[] = cut.map((cells, id) => {
    const turns = 1 + Math.floor(rnd() * 3); // always scrambled: 1..3 turns
    correctRot.push((4 - turns) % 4);
    return { id, cells: rotate(cells, turns) };
  });
  const tray = shuffle(tiles.map((t) => t.id), rnd);
  return { key, solution: w.grid, entries, tiles, tray, correctRot };
}

// ---------- checking ----------
/** Assemble the player's arrangement into a SIZE x SIZE grid; null where no tile is placed. */
export function assemble(p: Puzzle, slots: (SlotState | null)[]): (string | null)[][] {
  const out: (string | null)[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  slots.forEach((s, i) => {
    if (!s) return;
    const tile = p.tiles[s.tile];
    if (!tile) return;
    const cells = rotate(tile.cells, s.rot);
    const tr = Math.floor(i / TILES_PER_SIDE);
    const tc = i % TILES_PER_SIDE;
    for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) out[tr * TILE + r][tc * TILE + c] = cells[r][c];
  });
  return out;
}

export function checkArrangement(p: Puzzle, slots: (SlotState | null)[]) {
  const g = assemble(p, slots);
  const correctEntries = p.entries
    .filter((e) => {
      for (let i = 0; i < e.length; i++) {
        const r = e.row + (e.dir === "down" ? i : 0);
        const c = e.col + (e.dir === "across" ? i : 0);
        if (g[r][c] !== e.answer[i]) return false;
      }
      return true;
    })
    .map((e) => e.id);
  let solved = true;
  for (let r = 0; r < SIZE && solved; r++)
    for (let c = 0; c < SIZE; c++) {
      const want = p.solution[r][c] || BLOCK;
      if (g[r][c] !== want) {
        solved = false;
        break;
      }
    }
  return { solved, correctEntries };
}

/** Tiles (with correct slot + rotation) that cover any cell of an entry. */
export function revealEntry(p: Puzzle, entryId: string) {
  const e = p.entries.find((x) => x.id === entryId);
  if (!e) return null;
  const tiles = new Set<number>();
  for (let i = 0; i < e.length; i++) {
    const r = e.row + (e.dir === "down" ? i : 0);
    const c = e.col + (e.dir === "across" ? i : 0);
    tiles.add(Math.floor(r / TILE) * TILES_PER_SIDE + Math.floor(c / TILE));
  }
  return [...tiles].map((t) => ({ tile: t, slot: t, rot: p.correctRot[t] }));
}

/** Plain-text share result, e.g. for pasting into chat. */
export function shareText(key: string, moves: number, reveals: number, streak: number): string {
  const squares = "🟩".repeat(TILES_PER_SIDE * TILES_PER_SIDE - reveals) + "🟨".repeat(reveals);
  const rows = [];
  for (let i = 0; i < TILES_PER_SIDE; i++) rows.push(squares.slice(i * TILES_PER_SIDE * 2, (i + 1) * TILES_PER_SIDE * 2));
  return `Tiled Words clone ${key}\n${moves} moves · ${reveals} reveal${reveals === 1 ? "" : "s"}${streak > 1 ? ` · ${streak}-day streak` : ""}\n${rows.join("\n")}`;
}
