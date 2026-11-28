export type Status = "suggested" | "funding" | "testing" | "complete" | "expired";

export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  description: string;
  goal_cents: number;
  status: Status;
  deadline: string;
  raised_cents: number;
  backers: number;
  percent: number;
  days_left: number;
}
export interface Detail extends Product {
  pledges: { name: string; amount_cents: number; refunded: number; created_at: string }[];
  results: {
    rows: { lot: string; analyte: string; value_ng_g: number | null; loq_ng_g: number }[];
    summary: { analyte: string; lots_tested: number; lots_detected: number; max_ng_g: number | null }[];
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const api = {
  list: (status: string, q: string) =>
    req<Product[]>(`/products?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`),
  get: (id: number) => req<Detail>(`/products/${id}`),
  suggest: (b: { name: string; brand: string; category: string; description: string }) =>
    req<Product>("/products", { method: "POST", body: JSON.stringify(b) }),
  pledge: (id: number, b: { name: string; email: string; amount_cents: number }) =>
    req<Product>(`/products/${id}/pledges`, { method: "POST", body: JSON.stringify(b) }),
};

export const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
