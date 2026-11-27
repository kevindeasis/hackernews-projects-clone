export interface Hit {
  id: number;
  url: string;
  domain: string;
  title: string;
  visits: number;
  last_seen: string;
  snippet?: string;
}
export interface Stats {
  pages: number;
  visits: number;
  domains: number;
  topDomains: { domain: string; pages: number }[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  search: (q: string) => fetch(`/api/search?q=${encodeURIComponent(q)}`).then(j<Hit[]>),
  recent: () => fetch("/api/pages").then(j<Hit[]>),
  stats: () => fetch("/api/stats").then(j<Stats>),
  addUrl: (url: string) => post("/api/pages/fetch", { url }).then(j<unknown>),
  remove: (id: number) => fetch(`/api/pages/${id}`, { method: "DELETE" }).then(j<void>),
  blocklist: () => fetch("/api/blocklist").then(j<string[]>),
  block: (domain: string) => post("/api/blocklist", { domain }).then(j<unknown>),
  unblock: (d: string) => fetch(`/api/blocklist/${encodeURIComponent(d)}`, { method: "DELETE" }).then(j<void>),
};
