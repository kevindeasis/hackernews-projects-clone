/**
 * Strength-curve model.
 *
 * For one exercise the heaviest weight you can lift for `r` reps follows
 *   w(r) = E / (1 + r / k)
 * which is the Epley formula (E = estimated 1RM, k = 30) with a fitted `k`.
 * Every logged set is a point (reps, weight); we fit E and k to the
 * *frontier* of those points (sets nobody has beaten at both weight and reps)
 * with recency weighting, then read prescriptions off the curve.
 */

export interface SetPoint {
  weight: number;
  reps: number;
  rpe?: number | null;
  /** ISO date (YYYY-MM-DD) */
  date: string;
}

export interface CurveFit {
  e1rm: number;
  k: number;
  points: number;
}

export interface Prescription {
  label: string;
  reps: number;
  weight: number;
  /** Percent of estimated 1RM */
  percent: number;
}

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 56;
export const DEFAULT_K = 30;

/** Reps actually completed plus reps left in the tank (from RPE, if given). */
export function effectiveReps(s: Pick<SetPoint, "reps" | "rpe">): number {
  const reserve = s.rpe != null ? Math.max(0, 10 - s.rpe) : 0;
  return s.reps + reserve;
}

export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / DEFAULT_K);
}

const STALE_DAYS = 90;

/**
 * Drop sets that another set beats on both weight and (effective) reps.
 * A set that is more than STALE_DAYS older than `a` cannot dominate it, so an
 * old PR doesn't hide that you are currently weaker (recency weighting handles the rest).
 */
export function frontier<T extends Pick<SetPoint, "weight" | "reps" | "rpe"> & { date?: string }>(sets: T[]): T[] {
  const staleFor = (a: T, b: T) =>
    !!a.date && !!b.date && (new Date(a.date).getTime() - new Date(b.date).getTime()) / DAY_MS > STALE_DAYS;
  return sets.filter(
    (a) =>
      !sets.some(
        (b) =>
          b !== a &&
          !staleFor(a, b) &&
          b.weight >= a.weight &&
          effectiveReps(b) >= effectiveReps(a) &&
          (b.weight > a.weight || effectiveReps(b) > effectiveReps(a)),
      ),
  );
}

export function fitCurve(sets: SetPoint[], today: Date = new Date()): CurveFit | null {
  const valid = sets.filter((s) => s.weight > 0 && s.reps > 0);
  if (valid.length === 0) return null;
  const pts = frontier(valid);
  const wt = pts.map((p) => {
    const age = Math.max(0, (today.getTime() - new Date(p.date).getTime()) / DAY_MS);
    return Math.pow(0.5, age / HALF_LIFE_DAYS);
  });

  // With <3 distinct rep counts the shape is under-determined: fix k, fit E only.
  const distinctReps = new Set(pts.map(effectiveReps)).size;
  const ks = distinctReps >= 3 ? range(18, 60, 1) : [DEFAULT_K];

  let best: CurveFit & { sse: number } | null = null;
  for (const k of ks) {
    let num = 0;
    let den = 0;
    pts.forEach((p, i) => {
      const g = 1 / (1 + effectiveReps(p) / k);
      num += wt[i] * p.weight * g;
      den += wt[i] * g * g;
    });
    const e1rm = num / den;
    let sse = 0;
    pts.forEach((p, i) => {
      const err = p.weight - e1rm / (1 + effectiveReps(p) / k);
      sse += wt[i] * err * err;
    });
    if (!best || sse < best.sse) best = { e1rm, k, points: pts.length, sse };
  }
  return best && { e1rm: round(best.e1rm, 1), k: best.k, points: best.points };
}

export const predictWeight = (fit: CurveFit, reps: number) => fit.e1rm / (1 + reps / fit.k);
export const predictMaxReps = (fit: CurveFit, weight: number) => Math.max(0, fit.k * (fit.e1rm / weight - 1));

export function roundDown(x: number, step: number): number {
  return Math.floor(x / step + 1e-9) * step;
}

const TARGETS = [
  { label: "Heavy", reps: 5 },
  { label: "Medium", reps: 10 },
  { label: "Light", reps: 15 },
];

/** Weights along the curve for the heavy/medium/light zones, leaving `rir` reps in reserve. */
export function prescribe(fit: CurveFit, opts: { increment: number; rir: number }): Prescription[] {
  return TARGETS.map((t) => {
    const raw = predictWeight(fit, t.reps + opts.rir);
    const weight = Math.max(opts.increment, roundDown(raw, opts.increment));
    return { label: t.label, reps: t.reps, weight: round(weight, 2), percent: Math.round((weight / fit.e1rm) * 100) };
  });
}

/** The curve sampled for charting: weight you can do at 1..maxReps reps. */
export function sampleCurve(fit: CurveFit, maxReps = 20) {
  return range(1, maxReps, 1).map((reps) => ({ reps, weight: round(predictWeight(fit, reps), 1) }));
}

const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let x = a; x <= b; x += step) out.push(x);
  return out;
};
export const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
