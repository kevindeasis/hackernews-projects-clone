export interface Fit { e1rm: number; k: number; points: number }
export interface Prescription { label: string; reps: number; weight: number; percent: number }
export interface Settings { unit: "kg" | "lb"; increment: number; rir: number }
export interface ExerciseRow { id: number; name: string; setCount: number; e1rm: number | null; lastDate: string | null }
export interface SetRow { id: number; weight: number; reps: number; rpe: number | null; date: string; onFrontier: boolean }
export interface ExerciseDetail {
  exercise: { id: number; name: string };
  settings: Settings;
  sets: SetRow[];
  fit: Fit | null;
  prescription: Prescription[];
  curve: { reps: number; weight: number }[];
  e1rmHistory: { date: string; e1rm: number }[];
}
export interface PlanRow { id: number; name: string; fit: Fit | null; prescription: Prescription[]; lastDate: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
const body = (data: unknown) => JSON.stringify(data);

export const api = {
  settings: () => call<Settings>("/settings"),
  saveSettings: (s: Partial<Settings>) => call<Settings>("/settings", { method: "PUT", body: body(s) }),
  exercises: () => call<ExerciseRow[]>("/exercises"),
  addExercise: (name: string) => call("/exercises", { method: "POST", body: body({ name }) }),
  deleteExercise: (id: number) => call<void>(`/exercises/${id}`, { method: "DELETE" }),
  exercise: (id: number) => call<ExerciseDetail>(`/exercises/${id}`),
  addSet: (id: number, s: { weight: number; reps: number; rpe?: number | null }) =>
    call(`/exercises/${id}/sets`, { method: "POST", body: body(s) }),
  deleteSet: (id: number) => call<void>(`/sets/${id}`, { method: "DELETE" }),
  plan: () => call<{ settings: Settings; exercises: PlanRow[] }>("/plan"),
};
