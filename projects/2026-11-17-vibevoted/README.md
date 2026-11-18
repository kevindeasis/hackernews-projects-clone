# VibeVoted clone

Clone of **VibeVoted** (https://vibevoted.com/), a platform for product assessment and competitions where products are ranked by 10 AI models.

- Original author on HN: **stanislavb**
- HN thread: [Ask HN: What Are You Working On? (November 2026)](https://news.ycombinator.com/item?id=50417407)

> Note: the original site could not be fetched from the build environment, so this clone is built from the one-line description in the thread (product assessment + competitions, ranked by 10 AI models). Details such as criteria and scoring are my own design.

## What the original does
Lets people enter products into competitions and has a panel of 10 AI models assess and rank them.

## What this clone implements (v1)
- Create competitions with configurable scoring criteria (default: Clarity, Usefulness, Originality, Polish).
- Submit products (name, URL, tagline, description); a panel of **10 judges**, each with a persona, scores every product per criterion (0-10) with a short rationale.
- Consensus leaderboard using **Borda count** (robust to generous/harsh judges), tie-broken by mean score; shows mean, standard deviation (judge disagreement) and a per-judge breakdown.
- Judges are pluggable: by default deterministic **heuristic judges** (zero setup, reproducible); set `ANTHROPIC_API_KEY` to have each judge persona call an LLM (falls back to heuristic on any error).
- Not yet: accounts/auth, human voting, other model providers, per-judge different models, public sharing, pagination.

## Stack
TypeScript throughout. Vite + React client, Express server, SQLite.

- `better-sqlite3`: zero-service persistence.
- `zod`: request validation.
- `@tanstack/react-query`: client data fetching/caching.
- `vitest` + `supertest`: unit and API tests.
- `concurrently`: one-command dev.

## Run
```bash
npm install
npm run dev      # server :3008, client on Vite's port (proxying /api)
npm test
npm run build && npm start   # serves built client from :3008
```
Config: see `.env.example`.

## Ideas for next iterations
- Real multi-model panel (Anthropic, OpenAI, Gemini, open models) with per-judge model config.
- Human votes alongside AI votes; compare agreement (Kendall tau).
- Fetch the product URL and judge the actual page content/screenshot.
- Competition deadlines, public/private visibility, auth.
- Pairwise (Elo/Bradley-Terry) ranking instead of absolute scoring.
- Per-criterion leaderboards and charts.
