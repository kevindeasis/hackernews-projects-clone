# Extreme Puzzles (extremepuzzlebooks.com clone)

A puzzle-book app: difficult **Sudoku**, **Killer Sudoku** and **Wordsearch**, organised into numbered "book" pages, each with an online step-by-step walkthrough.

## The original
- Project: [Extreme Puzzle Books](https://extremepuzzlebooks.com) by HN user **Malcx**.
- HN thread: [Ask HN: What Are You Working On? (November 2026)](https://news.ycombinator.com/item?id=50417407). Malcx describes difficult sudoku, killer sudoku and wordsearch puzzle books with online walkthroughs.
- Note: the nightly run could not reach the original site or the HN API (egress blocked), so this clone is built from the HN description only, not from the real site's look or content.

## What this clone implements
- Books for 3 puzzle kinds x 4 difficulty levels (easy, medium, hard, extreme), 20 pages each. A page's seed is fixed, so page N is always the same puzzle. "Random puzzle" makes a one-off.
- **Sudoku**: unique-solution generator graded by a human-style solver (naked/hidden singles, locked candidates, naked pairs). "Extreme" means those techniques are not enough.
- **Killer Sudoku**: cage generator with uniqueness checking, dashed cage rendering with sums, and a solver that prunes using cage digit combinations. For hard layouts it may reveal a few given digits to stay unique.
- **Wordsearch**: themed generator (space, kitchen, animals, coding); harder levels add diagonals/backwards words and bigger grids.
- **Walkthrough**: server-side solver returns every deduction in order; the UI steps forward/back and highlights the cells involved.
- Timer, answer checking, per-puzzle best times and a stats page (SQLite).

Not yet implemented: pencil marks, undo, printable/PDF books, accounts, cage-technique variety beyond combination pruning, walkthrough explanations of eliminations on the board (only counts are shown).

## Stack
- React + Vite + TypeScript: UI. `@tanstack/react-query`: data fetching. `react-router-dom`: routing.
- Express + TypeScript: API. `zod`: request validation.
- `better-sqlite3`: zero-service persistence for puzzles and results.
- `vitest` + `supertest`: tests for the solvers/generators and the API.

## Run it
```bash
npm install
npm run dev     # API on :3017, Vite on :5173 (proxies /api)
npm test        # solver, generator and API tests
npm run build && npm start   # serves the built client from Express on :3017
```
Set `DB_FILE` to change the SQLite path (default `puzzles.db`, git-ignored).

## Layout
- `server/src/core/`: `sudoku.ts` (solver, generator, human techniques), `killer.ts`, `wordsearch.ts`, `rng.ts` (seeded PRNG).
- `server/src/app.ts`: routes. `client/src/`: pages and board components.

## Ideas for next iterations
- Pencil marks and undo/redo; show candidate eliminations in the walkthrough.
- More techniques (X-wing, swordfish, killer cage-split / innies-outies) for truer difficulty grading.
- Export a whole book to printable PDF with answer pages and walkthroughs.
- Accounts and sync of progress; daily puzzle and leaderboard.
- More wordsearch themes and user-supplied word lists.
