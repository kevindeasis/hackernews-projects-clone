/**
 * The judge panel. Each judge scores a product on every criterion (0-10).
 * Judges implement one interface so heuristic judges and LLM-backed judges are interchangeable.
 */
export interface ProductInput {
  name: string;
  url: string;
  tagline: string;
  description: string;
}

export interface Evaluation {
  scores: Record<string, number>;
  overall: number;
  rationale: string;
}

export interface Judge {
  id: string;
  name: string;
  /** One-line persona; used as the LLM system prompt and shown in the UI. */
  persona: string;
  /** Per-criterion multiplier (heuristic judges) so judges genuinely disagree. */
  bias: Record<string, number>;
  evaluate(p: ProductInput, criteria: string[]): Promise<Evaluation>;
}

export const DEFAULT_CRITERIA = ["Clarity", "Usefulness", "Originality", "Polish"];

const PERSONAS: { id: string; name: string; persona: string; bias: Record<string, number> }[] = [
  { id: "atlas", name: "Atlas", persona: "A pragmatic engineer who rewards things that obviously work.", bias: { Usefulness: 1.15, Polish: 0.95 } },
  { id: "nova", name: "Nova", persona: "A design-obsessed founder who cares about craft.", bias: { Polish: 1.2, Clarity: 1.05 } },
  { id: "sage", name: "Sage", persona: "A skeptical investor asking whether anyone will pay.", bias: { Usefulness: 1.2, Originality: 0.9 } },
  { id: "pixel", name: "Pixel", persona: "A hobbyist who loves quirky, original ideas.", bias: { Originality: 1.25, Usefulness: 0.9 } },
  { id: "quill", name: "Quill", persona: "A technical writer who values clear explanations.", bias: { Clarity: 1.25 } },
  { id: "orbit", name: "Orbit", persona: "A growth marketer judging the pitch and positioning.", bias: { Clarity: 1.1, Originality: 1.05 } },
  { id: "forge", name: "Forge", persona: "A maker who rewards depth of description and effort.", bias: { Polish: 1.1, Usefulness: 1.05 } },
  { id: "echo", name: "Echo", persona: "A cautious reviewer who scores conservatively.", bias: { Clarity: 0.9, Usefulness: 0.9, Originality: 0.9, Polish: 0.9 } },
  { id: "bolt", name: "Bolt", persona: "An enthusiast who is generous with scores.", bias: { Clarity: 1.1, Usefulness: 1.1, Originality: 1.1, Polish: 1.1 } },
  { id: "rune", name: "Rune", persona: "A contrarian who is hard to impress with common ideas.", bias: { Originality: 1.2, Clarity: 0.95 } },
];

/** Small deterministic string hash -> [0,1). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

/** Text-feature baseline (0-10) for one criterion. */
export function baseScore(p: ProductInput, criterion: string): number {
  const desc = p.description.trim();
  const words = desc.split(/\s+/).filter(Boolean).length;
  const tagWords = p.tagline.trim().split(/\s+/).filter(Boolean).length;
  const https = /^https:\/\//.test(p.url);
  const lc = criterion.toLowerCase();
  if (lc === "clarity") {
    const tagOk = tagWords >= 3 && tagWords <= 12 ? 3 : tagWords > 0 ? 1.5 : 0;
    return 3 + tagOk + Math.min(words / 20, 3) + (words > 150 ? -1 : 0.5);
  }
  if (lc === "usefulness") {
    const kw = (desc.match(/\b(save|automate|track|manage|find|help|simplif|faster|monitor|import|export|api)\w*/gi) ?? []).length;
    return 3 + Math.min(kw * 0.8, 4) + Math.min(words / 40, 2);
  }
  if (lc === "originality") {
    const generic = (desc.match(/\b(platform|dashboard|ai-powered|saas|all-in-one|solution)\b/gi) ?? []).length;
    const uniq = new Set(desc.toLowerCase().split(/\W+/).filter((w) => w.length > 4)).size;
    return 4 + Math.min(uniq / 10, 4) - generic * 0.7;
  }
  if (lc === "polish") {
    return 3 + (https ? 2 : 0) + (p.url ? 1 : 0) + (/[.!?]$/.test(desc) ? 1 : 0) + Math.min(words / 30, 2);
  }
  return 5 + Math.min(words / 30, 3);
}

/** Deterministic judge: same input always yields the same scores. */
export function heuristicJudge(def: (typeof PERSONAS)[number]): Judge {
  return {
    ...def,
    async evaluate(p, criteria) {
      const scores: Record<string, number> = {};
      for (const c of criteria) {
        const noise = (hash01(`${def.id}|${p.name}|${c}`) - 0.5) * 1.6; // +/-0.8
        scores[c] = clamp(baseScore(p, c) * (def.bias[c] ?? 1) + noise);
      }
      const vals = Object.values(scores);
      const overall = clamp(vals.reduce((a, b) => a + b, 0) / (vals.length || 1));
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const worst = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
      return { scores, overall, rationale: `${def.name}: strongest on ${best?.[0]} (${best?.[1]}), weakest on ${worst?.[0]} (${worst?.[1]}).` };
    },
  };
}

/** LLM-backed judge using the Anthropic Messages API; falls back to the heuristic judge on any error. */
export function llmJudge(def: (typeof PERSONAS)[number], apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Judge {
  const fallback = heuristicJudge(def);
  return {
    ...def,
    async evaluate(p, criteria) {
      try {
        const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            system: `You are ${def.name}. ${def.persona} Score the product on each criterion from 0 to 10. Reply with JSON only: {"scores":{"<criterion>":number},"rationale":"one sentence"}.`,
            messages: [{ role: "user", content: `Criteria: ${criteria.join(", ")}\nName: ${p.name}\nURL: ${p.url}\nTagline: ${p.tagline}\nDescription: ${p.description}` }],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { content: { text?: string }[] };
        const parsed = parseJudgeJson(data.content?.[0]?.text ?? "", criteria);
        if (!parsed) throw new Error("unparseable");
        return parsed;
      } catch {
        return fallback.evaluate(p, criteria);
      }
    },
  };
}

export function parseJudgeJson(text: string, criteria: string[]): Evaluation | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { scores?: Record<string, unknown>; rationale?: unknown };
    const scores: Record<string, number> = {};
    for (const c of criteria) {
      const v = Number(j.scores?.[c]);
      if (!Number.isFinite(v)) return null;
      scores[c] = clamp(v);
    }
    const overall = clamp(Object.values(scores).reduce((a, b) => a + b, 0) / (criteria.length || 1));
    return { scores, overall, rationale: String(j.rationale ?? "") };
  } catch {
    return null;
  }
}

export function buildPanel(env: { apiKey?: string; model?: string } = {}): Judge[] {
  return PERSONAS.map((d) => (env.apiKey ? llmJudge(d, env.apiKey, env.model ?? "claude-sonnet-4-5") : heuristicJudge(d)));
}
