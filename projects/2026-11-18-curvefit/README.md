# CurveFit clone (curvefit.app)

**Original:** [curvefit.app](https://curvefit.app) by HN user **jerkstate**, from the
[Ask HN: What are you working on? (September 2026)](https://news.ycombinator.com/item?id=49686380) thread.

## What the original does
A weight-training app that trains you along a "pareto frontier" of weight vs. reps. For every exercise it prescribes
lower-weight/higher-rep, medium, and higher-weight/lower-rep work from a learned strength curve, adjusting as you log
more data. Built to protect tendons and balance strength, hypertrophy and injury prevention. (Built from the HN
description plus the site's stated idea; I could not load the live site, so UI and details are my own interpretation.)

## What this clone implements
- Exercises and set logging (weight, reps, optional RPE), SQLite persistence.
- Strength-curve fit per exercise: `weight(r) = E / (1 + r/k)` (Epley generalised with fitted `k`), fit to the Pareto frontier of
  logged sets with 56-day recency half-life; RPE counts as reps in reserve.
- "Today" plan: heavy (5), medium (10), light (15) rep prescriptions, rounded down to your plate increment, with reps-in-reserve buffer.
- Charts: fitted curve with frontier/other/prescribed points, estimated-1RM history.
- Settings: kg/lb, plate increment, reps in reserve.

**Not yet:** auth/multi-user, workout sessions/templates, the original's fatigue-curve modelling, tendon-specific tempo/volume guidance, import/export, ads-free hosting on Cloudflare.

## Stack
- React + Vite + TypeScript — client. Recharts — curve and trend charts. TanStack Query — data fetching/cache.
- Express + TypeScript — API. zod — request validation. better-sqlite3 — zero-service persistence (`server/data/`).
- Vitest + supertest — tests of the curve math and API.

## Run
```
npm install
npm run dev      # client http://localhost:5173, API :3009
npm test
npm run build && npm start   # single server on :3009
```

## Ideas for next iterations
- Model fatigue across sets/sessions (the original's open question) and prescribe set counts.
- Per-exercise `k` priors, outlier rejection, confidence bands on the curve.
- Workout sessions with rest timers and "log prescribed set" one-tap buttons.
- CSV import/export; PWA/offline; port to Cloudflare Workers + D1.
- Tendon-focused slow-tempo prescriptions; deload detection.
