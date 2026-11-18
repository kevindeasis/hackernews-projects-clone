export interface JudgeResult {
  productId: number;
  judgeId: string;
  overall: number;
}

export interface Ranked {
  productId: number;
  rank: number;
  mean: number;
  stdev: number;
  /** Borda points: sum over judges of (numProducts - judgeRank). */
  borda: number;
  judges: number;
}

/** Rank products within one judge's results (1 = best); ties share the best rank. */
export function judgeRanks(results: JudgeResult[]): Map<number, number> {
  const sorted = [...results].sort((a, b) => b.overall - a.overall);
  const ranks = new Map<number, number>();
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    ranks.set(r.productId, prev && prev.overall === r.overall ? ranks.get(prev.productId)! : i + 1);
  });
  return ranks;
}

/**
 * Aggregate the panel into a consensus leaderboard.
 * Primary key: Borda count (robust to judges that score generously or harshly);
 * tie-breaker: mean overall score.
 */
export function aggregate(results: JudgeResult[]): Ranked[] {
  const byJudge = new Map<string, JudgeResult[]>();
  for (const r of results) byJudge.set(r.judgeId, [...(byJudge.get(r.judgeId) ?? []), r]);
  const stats = new Map<number, { scores: number[]; borda: number }>();
  for (const rs of byJudge.values()) {
    const ranks = judgeRanks(rs);
    for (const r of rs) {
      const s = stats.get(r.productId) ?? { scores: [], borda: 0 };
      s.scores.push(r.overall);
      s.borda += rs.length - ranks.get(r.productId)!;
      stats.set(r.productId, s);
    }
  }
  const rows = [...stats.entries()].map(([productId, s]) => {
    const mean = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
    const variance = s.scores.reduce((a, b) => a + (b - mean) ** 2, 0) / s.scores.length;
    return { productId, mean: round(mean), stdev: round(Math.sqrt(variance)), borda: s.borda, judges: s.scores.length, rank: 0 };
  });
  rows.sort((a, b) => b.borda - a.borda || b.mean - a.mean || a.productId - b.productId);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.borda === r.borda && prev.mean === r.mean ? prev.rank : i + 1;
  });
  return rows;
}

const round = (n: number) => Math.round(n * 100) / 100;
