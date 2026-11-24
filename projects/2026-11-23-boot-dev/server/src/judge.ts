import vm from "node:vm";
import Database from "better-sqlite3";
import type { Lesson } from "./lessons.js";

export type TestResult = { name: string; passed: boolean; detail?: string };
export type JudgeResult = { passed: boolean; results: TestResult[]; error?: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Run JS lesson code in a fresh vm context with a timeout. NOTE: node:vm is not a security boundary. */
export function judgeJs(lesson: Lesson, code: string): JudgeResult {
  const results: TestResult[] = [];
  for (const t of lesson.tests ?? []) {
    try {
      const ctx = vm.createContext({});
      const actual = vm.runInContext(`${code}\n;JSON.stringify(${t.call})`, ctx, { timeout: 1000 });
      const parsed = actual === undefined ? undefined : JSON.parse(actual);
      const ok = same(parsed, t.expected);
      results.push({ name: t.call, passed: ok, detail: ok ? undefined : `expected ${JSON.stringify(t.expected)}, got ${actual}` });
    } catch (e) {
      results.push({ name: t.call, passed: false, detail: (e as Error).message });
    }
  }
  return { passed: results.length > 0 && results.every((r) => r.passed), results };
}

/** Run a SELECT against an in-memory SQLite seeded by lesson.setup and compare to the expected query's rows. */
export function judgeSql(lesson: Lesson, query: string): JudgeResult {
  const db = new Database(":memory:");
  try {
    db.exec(lesson.setup ?? "");
    const stmt = db.prepare(query);
    if (!stmt.reader) throw new Error("Only SELECT queries are allowed");
    stmt.raw(true);
    const actual = stmt.all() as unknown[][];
    const expected = db.prepare(lesson.expectedQuery!).raw(true).all() as unknown[][];
    const norm = (rows: unknown[][]) => (lesson.orderMatters ? rows : [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const ok = same(norm(actual), norm(expected));
    return {
      passed: ok,
      results: [{ name: "query result", passed: ok, detail: ok ? undefined : `expected ${expected.length} rows ${JSON.stringify(expected)}, got ${actual.length} rows ${JSON.stringify(actual)}` }],
    };
  } catch (e) {
    return { passed: false, results: [{ name: "query result", passed: false, detail: (e as Error).message }], error: (e as Error).message };
  } finally {
    db.close();
  }
}

export const judge = (lesson: Lesson, code: string) => (lesson.kind === "sql" ? judgeSql(lesson, code) : judgeJs(lesson, code));
