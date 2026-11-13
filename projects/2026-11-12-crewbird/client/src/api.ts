export interface Customer { id: number; name: string; phone: string; email: string; address: string; notes: string }
export interface Technician { id: number; name: string }
export type Status = "lead" | "scheduled" | "in_progress" | "done" | "invoiced" | "paid";
export interface Job {
  id: number; customer_id: number; technician_id: number | null; title: string; status: Status; source: string;
  scheduled_date: string | null; scheduled_time: string | null; duration_min: number; price_cents: number;
  customer_name: string; customer_address: string; technician_name: string | null;
}
export interface Summary { counts: Record<Status, number>; unpaidCents: number; paidCents: number }

export const NEXT_STATUS: Record<Status, Status | null> = {
  lead: null, scheduled: "in_progress", in_progress: "done", done: "invoiced", invoiced: "paid", paid: null,
};

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

export const api = {
  customers: () => call<Customer[]>("/customers"),
  addCustomer: (c: Partial<Customer>) => call<Customer>("/customers", "POST", c),
  technicians: () => call<Technician[]>("/technicians"),
  jobs: (q = "") => call<Job[]>(`/jobs${q}`),
  addJob: (j: unknown) => call<Job>("/jobs", "POST", j),
  patchJob: (id: number, j: unknown) => call<Job>(`/jobs/${id}`, "PATCH", j),
  setStatus: (id: number, status: Status) => call<Job>(`/jobs/${id}/status`, "POST", { status }),
  addLead: (l: unknown) => call<Job>("/leads", "POST", l),
  summary: () => call<Summary>("/summary"),
};

export const money = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
