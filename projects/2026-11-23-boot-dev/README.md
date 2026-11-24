# Bootcamp (boot.dev clone)

Gamified "learn to code by doing" platform: pick a course, write code in the browser, get graded by tests, earn XP, level up, keep a daily streak and climb the leaderboard.

## Original
- Project: [boot.dev](https://www.boot.dev) by **wagslane** (Lane Wagner), mentioned in the [Nov 2026 "What Are You Working On?" thread](https://news.ycombinator.com/item?id=50417407) ([comment](https://news.ycombinator.com/item?id=50420612)): interactive programming courses with in-browser exercises (k8s, C, terraform, bash).
- Note: Hacker News API/Algolia were blocked from the build sandbox, so the thread was read via a mirror (zeli.app).

## What this clone implements
- Two courses (JavaScript, 5 lessons; SQL, 4 lessons) with instructions, starter code and a CodeMirror editor.
- Server-side grading: JS code runs in a `node:vm` context against test calls (1s timeout); SQL runs against an in-memory SQLite seeded per lesson and the result set is compared to a reference query (row order ignored unless the lesson requires it; SELECT only).
- XP awarded once per lesson, levels (`50·n·(n-1)` XP thresholds), day streaks, leaderboard.
- Name-only login (no passwords).

Not yet: real auth, sandboxed execution, hints/solutions, more courses, certificates, chat "Boots" mascot.

## Stack
- React + Vite + TypeScript (client), Express + TypeScript (server), better-sqlite3 for persistence and for SQL lesson grading.
- `@uiw/react-codemirror` + `@codemirror/lang-javascript/sql`: code editor with syntax highlighting.
- `@tanstack/react-query`: data fetching/cache. `zod`: request validation. `vitest` + `supertest`: tests.

## Run
```
npm install
npm run dev     # client http://localhost:5173, API :3023
npm test        # judge, XP/streak and API tests
npm run build && npm start   # serves built client + API on :3023
```

> Security: `node:vm` is **not** a sandbox. Do not expose this to untrusted users before moving grading into isolated workers/containers.

## Ideas for next iterations
- Run JS in worker threads / isolated-vm / containers; add Python lessons.
- Real accounts (OAuth), per-lesson hints and solution reveal.
- Course/lesson content as markdown files with a progress map UI.
- Boss battles, achievements, daily quests.
- Code-split the client (CodeMirror bundle is >500 kB).
