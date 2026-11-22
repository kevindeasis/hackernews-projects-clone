export type Severity = "none" | "mild" | "moderate" | "severe";
export const SEVERITY_RANK: Record<Severity, number> = { none: 0, mild: 1, moderate: 2, severe: 3 };

export interface EntryRow {
  id: number;
  date: string; // YYYY-MM-DD
  meal: string;
  food: string;
  allergen: string | null;
  reaction: Severity;
  notes: string;
}

export interface FoodStat {
  food: string;
  allergen: string | null;
  timesEaten: number;
  firstTried: string;
  lastTried: string;
  reactions: number;
  worstReaction: Severity;
  reactionRate: number; // 0..1
  suspect: boolean;
}

/** Foods the baby has had, with how often each was followed by a reaction. */
export function foodStats(entries: EntryRow[]): FoodStat[] {
  const map = new Map<string, FoodStat>();
  for (const e of entries) {
    const key = e.food.trim().toLowerCase();
    let s = map.get(key);
    if (!s) {
      s = { food: e.food.trim(), allergen: e.allergen, timesEaten: 0, firstTried: e.date, lastTried: e.date,
        reactions: 0, worstReaction: "none", reactionRate: 0, suspect: false };
      map.set(key, s);
    }
    s.timesEaten++;
    if (e.date < s.firstTried) s.firstTried = e.date;
    if (e.date > s.lastTried) s.lastTried = e.date;
    if (e.reaction !== "none") {
      s.reactions++;
      if (SEVERITY_RANK[e.reaction] > SEVERITY_RANK[s.worstReaction]) s.worstReaction = e.reaction;
    }
  }
  for (const s of map.values()) {
    s.reactionRate = s.reactions / s.timesEaten;
    // Suspect: any moderate/severe reaction, or reacted at least twice and on >= half of exposures.
    s.suspect = SEVERITY_RANK[s.worstReaction] >= 2 || (s.reactions >= 2 && s.reactionRate >= 0.5);
  }
  return [...map.values()].sort((a, b) => b.reactionRate - a.reactionRate || b.timesEaten - a.timesEaten);
}

export const ALLERGENS = ["egg", "peanut", "milk", "wheat", "soy", "fish", "shellfish", "tree nut", "sesame"] as const;

export interface AllergenStatus {
  allergen: string;
  introduced: boolean;
  firstTried: string | null;
  timesEaten: number;
  reactions: number;
}

/** Common-allergen checklist: which have been introduced and how it went. */
export function allergenChecklist(entries: EntryRow[]): AllergenStatus[] {
  return ALLERGENS.map((a) => {
    const es = entries.filter((e) => e.allergen === a);
    const dates = es.map((e) => e.date).sort();
    return { allergen: a, introduced: es.length > 0, firstTried: dates[0] ?? null, timesEaten: es.length,
      reactions: es.filter((e) => e.reaction !== "none").length };
  });
}

/** Plain-text summary a parent can hand to a GP. */
export function gpReport(entries: EntryRow[], babyName: string, from: string, to: string): string {
  const stats = foodStats(entries);
  const lines: string[] = [];
  lines.push(`Weaning diary for ${babyName || "baby"}: ${from} to ${to}`);
  lines.push(`${entries.length} meals logged, ${stats.length} different foods.`);
  const reacted = entries.filter((e) => e.reaction !== "none");
  lines.push("", `Reactions (${reacted.length}):`);
  if (!reacted.length) lines.push("  None recorded.");
  for (const e of reacted) lines.push(`  ${e.date} ${e.meal}: ${e.food} -> ${e.reaction}${e.notes ? ` (${e.notes})` : ""}`);
  const suspects = stats.filter((s) => s.suspect);
  lines.push("", "Suspected trigger foods:");
  if (!suspects.length) lines.push("  None identified.");
  for (const s of suspects) lines.push(`  ${s.food}: reacted ${s.reactions}/${s.timesEaten} times, worst ${s.worstReaction}`);
  lines.push("", "Common allergens introduced:");
  for (const a of allergenChecklist(entries)) {
    lines.push(`  ${a.allergen}: ${a.introduced ? `first ${a.firstTried}, ${a.timesEaten}x, ${a.reactions} reaction(s)` : "not yet introduced"}`);
  }
  return lines.join("\n");
}
