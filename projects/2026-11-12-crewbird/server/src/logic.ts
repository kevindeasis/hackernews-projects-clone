export const STATUSES = ["lead", "scheduled", "in_progress", "done", "invoiced", "paid"] as const;
export type Status = (typeof STATUSES)[number];

const NEXT: Record<Status, Status[]> = {
  lead: ["scheduled"],
  scheduled: ["in_progress", "lead"],
  in_progress: ["done"],
  done: ["invoiced"],
  invoiced: ["paid"],
  paid: [],
};

/** Whether a job may move from one status to another. */
export function canTransition(from: Status, to: Status): boolean {
  return NEXT[from].includes(to);
}

export interface Slot {
  technician_id: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_min: number;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** True when two scheduled jobs overlap for the same technician on the same day. */
export function overlaps(a: Slot, b: Slot): boolean {
  if (a.technician_id == null || a.technician_id !== b.technician_id) return false;
  if (!a.scheduled_date || a.scheduled_date !== b.scheduled_date) return false;
  if (!a.scheduled_time || !b.scheduled_time) return false;
  const a0 = toMin(a.scheduled_time), b0 = toMin(b.scheduled_time);
  return a0 < b0 + b.duration_min && b0 < a0 + a.duration_min;
}

export interface Summary {
  counts: Record<Status, number>;
  unpaidCents: number;
  paidCents: number;
}

/** Pipeline summary: job count per status plus outstanding / collected revenue. */
export function summarize(jobs: { status: Status; price_cents: number }[]): Summary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  let unpaidCents = 0, paidCents = 0;
  for (const j of jobs) {
    counts[j.status]++;
    if (j.status === "paid") paidCents += j.price_cents;
    else if (j.status === "invoiced" || j.status === "done") unpaidCents += j.price_cents;
  }
  return { counts, unpaidCents, paidCents };
}
