export interface Account { id: number; name: string; kind: "asset" | "liability"; opening_cents: number; balance_cents: number }
export interface Tx { id: number; account_id: number; account: string; date: string; amount_cents: number; category: string; description: string }
export interface MonthFlow { month: string; income: number; expenses: number; net: number }
export interface NetWorthPoint { month: string; assets: number; liabilities: number; netWorth: number }
export interface CategoryTotal { category: string; total: number }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.status === 204 ? (undefined as T) : r.json();
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  accounts: () => req<Account[]>("/api/accounts"),
  addAccount: (a: { name: string; kind: string; opening: number }) => req("/api/accounts", json("POST", a)),
  deleteAccount: (id: number) => req(`/api/accounts/${id}`, { method: "DELETE" }),
  transactions: (q: string) => req<Tx[]>(`/api/transactions?q=${encodeURIComponent(q)}`),
  addTx: (t: { account_id: number; date: string; amount: number; category: string; description: string }) => req("/api/transactions", json("POST", t)),
  deleteTx: (id: number) => req(`/api/transactions/${id}`, { method: "DELETE" }),
  importCsv: (id: number, csv: string) => req<{ imported: number }>(`/api/accounts/${id}/import`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv }),
  cashflow: () => req<MonthFlow[]>("/api/reports/cashflow"),
  categories: () => req<CategoryTotal[]>("/api/reports/categories"),
  networth: () => req<NetWorthPoint[]>("/api/reports/networth"),
};

export const money = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
