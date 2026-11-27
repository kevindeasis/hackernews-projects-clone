/**
 * Turns free-form user input into a safe SQLite FTS5 MATCH expression.
 *
 * Supported syntax:
 *   foo bar          all terms (AND), last term is a prefix match while typing
 *   "exact phrase"   phrase match
 *   -foo             exclude pages containing foo
 *   domain:example.com   restrict to a domain (returned separately, not in MATCH)
 */
export interface ParsedQuery {
  match: string | null; // null when there is nothing to search for
  domain: string | null;
}

const clean = (s: string) => s.replace(/["*^():{}\[\]]/g, " ").trim();

export function parseQuery(input: string): ParsedQuery {
  let domain: string | null = null;
  const positives: string[] = [];
  const negatives: string[] = [];

  const re = /(-?)(?:"([^"]+)"|(\S+))/g;
  let m: RegExpExecArray | null;
  const rawTokens: { neg: boolean; phrase: boolean; text: string }[] = [];
  while ((m = re.exec(input)) !== null) {
    const neg = m[1] === "-";
    if (m[2] !== undefined) rawTokens.push({ neg, phrase: true, text: m[2] });
    else rawTokens.push({ neg, phrase: false, text: m[3] });
  }

  rawTokens.forEach((t, i) => {
    if (!t.phrase) {
      const dm = /^domain:(\S+)$/i.exec(t.text);
      if (dm) {
        domain = dm[1].toLowerCase().replace(/^www\./, "");
        return;
      }
    }
    const words = clean(t.text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const isLast = i === rawTokens.length - 1;
    let expr: string;
    if (t.phrase || words.length > 1) {
      expr = `"${words.join(" ")}"`;
    } else {
      expr = `"${words[0]}"` + (isLast && !t.neg ? "*" : "");
    }
    (t.neg ? negatives : positives).push(expr);
  });

  if (positives.length === 0) return { match: null, domain };
  let match = positives.join(" AND ");
  for (const n of negatives) match += ` NOT ${n}`;
  return { match, domain };
}
