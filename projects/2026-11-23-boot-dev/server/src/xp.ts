/** Level n requires 50*n*(n-1) total XP: L1=0, L2=100, L3=300, L4=600... */
export function levelForXp(xp: number) {
  let level = 1;
  while (xp >= 50 * (level + 1) * level) level++;
  const floor = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, floor, next, progress: (xp - floor) / (next - floor) };
}

/** Consecutive-day streak ending today or yesterday. Dates are 'YYYY-MM-DD' strings. */
export function streak(days: string[], today: string): number {
  const set = new Set(days);
  const d = new Date(today + "T00:00:00Z");
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  if (!set.has(fmt(d))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(fmt(d))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
