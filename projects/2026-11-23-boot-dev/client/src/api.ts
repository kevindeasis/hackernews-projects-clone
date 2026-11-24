export type Me = { name: string; xp: number; level: number; progress: number; next: number; streak: number; completed: string[] };
export type CourseT = { id: string; title: string; description: string; kind: "js" | "sql"; lessons: { id: string; title: string; xp: number }[] };
export type LessonT = { id: string; course: string; title: string; xp: number; kind: "js" | "sql"; instructions: string; starter: string };
export type RunResult = { passed: boolean; results: { name: string; passed: boolean; detail?: string }[]; awarded: number; me: Me | null };

const user = () => localStorage.getItem("user") ?? "";
async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", "x-user": user(), ...init?.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}
export const api = {
  login: (name: string) => req<Me>("/api/login", { method: "POST", body: JSON.stringify({ name }) }),
  me: () => req<Me>("/api/me"),
  courses: () => req<CourseT[]>("/api/courses"),
  lesson: (id: string) => req<LessonT>(`/api/lessons/${id}`),
  run: (id: string, code: string) => req<RunResult>(`/api/lessons/${id}/run`, { method: "POST", body: JSON.stringify({ code }) }),
  leaderboard: () => req<{ name: string; xp: number; lessons: number }[]>("/api/leaderboard"),
};
