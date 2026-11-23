# Tiled Words clone

A clone of **[Tiled Words](https://tiledwords.com)**, a daily word puzzle where a finished crossword has been cut into tiles, scrambled and rotated, and you rebuild it from the clues.

- **Original HN post:** [Ask HN: What are you working on? (May 2026)](https://news.ycombinator.com/item?id=48085993) by **paulhebert** (mirror: https://hn.svelte.dev/item/48085993)
- **Original:** https://tiledwords.com ("Rotate and rearrange tiles to find clues and rebuild a broken crossword!"). Daily puzzle, 200+ backlog, accounts and streaks, reveal up to 3 words, player-submitted puzzles.

> HN itself was unreachable from the build environment (proxy 403), so the original's rules were pieced together from its how-to-play text and press coverage. Tile geometry, scoring and share format were not documented anywhere I could read, so those parts are my own interpretation (see below).

## What this clone implements

- Deterministic daily puzzle generated from the date (same puzzle for everyone), plus an archive (365 days) and endless practice puzzles.
- 9x9 crossword generated from a hand-written clue bank, cut into nine 3x3 tiles. Every tile is scrambled and rotated.
- Drag tiles between a tray and a 3x3 board (swap if occupied); tap a tile to rotate it a quarter turn clockwise; shuffle the tray.
- Across/Down clue lists with lengths. The server tells the client which clues are currently satisfied and they get checked off. Puzzle is solved when the whole grid matches.
- Reveal up to 3 words per puzzle (server-enforced): the tiles covering that word snap into place and lock.
- Progress saved server-side per anonymous client id (localStorage), so reloads resume. Move counter, daily streak / best streak / solved count, copyable share text.
- The solution is never sent to the browser; checking and revealing happen on the server.

Not implemented: accounts/logins, player-submitted puzzles and the builder, themed/human-written puzzles, tile shapes other than square blocks, timers, mobile polish.

## Stack

Default stack: React (Vite) + Express + SQLite, all TypeScript.

- `@dnd-kit/core`: drag and drop of tiles (pointer sensor with a 6px threshold so taps rotate and drags move).
- `@tanstack/react-query`: data fetching and caching.
- `express` + `zod`: API and request validation.
- `better-sqlite3`: zero-service persistence for progress, reveals and completions.
- `vitest` + `supertest`: tests for generation, rotation, checking, streaks and the API.

## Run

```
npm install
npm run dev     # client on http://localhost:5173, API on :3022
npm test        # server tests
npm run build && npm start   # production, serves client from :3022
```

Data lives in `server/data/tiled-words.db` (ignored by git).

## How it works

`server/src/puzzle.ts` generates a crossword by greedily placing words from `clues.ts` on a 9x9 grid (rejecting placements that would create accidental words), derives numbered entries, cuts the grid into tiles, and rotates each tile 1-3 quarter turns using a seeded RNG (`mulberry32` over a hash of the date), so puzzles are reproducible.

## Ideas for next iterations

- Much larger clue bank, themed puzzles with titles and bylines, difficulty levels.
- Puzzle builder and player-submitted puzzles with moderation.
- Real accounts instead of anonymous client ids, so streaks sync across devices.
- Non-square tile shapes and bigger grids; keyboard controls and better touch handling.
- Per-puzzle leaderboards, timers, and an emoji share grid that reflects the actual solve.
- Add tests for the React board (Playwright) now that logic is covered server-side.
