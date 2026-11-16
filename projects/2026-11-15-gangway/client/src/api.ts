export interface Site {
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
  active_version: number;
  versions: number;
  bytes: number;
}
export interface Version {
  version: number;
  created_at: string;
  file_count: number;
  bytes: number;
  note: string;
}
export interface SiteDetail extends Omit<Site, "versions" | "bytes" | "updated_at"> {
  versions: Version[];
}

const KEY = "gangway-token";
export const getToken = () => localStorage.getItem(KEY) ?? "";
export const setToken = (t: string) => localStorage.setItem(KEY, t);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${getToken()}`, ...(init.headers as any) };
  if (typeof init.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  sites: () => call<Site[]>("/api/sites"),
  site: (slug: string) => call<SiteDetail>(`/api/sites/${slug}`),
  deployHtml: (v: { slug?: string; name?: string; note?: string; html: string }) =>
    call<{ slug: string; version: number; url: string }>("/api/deploy", { method: "POST", body: JSON.stringify(v) }),
  deployArchive: (file: File, v: { slug?: string; name?: string; note?: string }) => {
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) if (val) fd.append(k, val);
    fd.append("archive", file);
    return call<{ slug: string; version: number; url: string }>("/api/deploy", { method: "POST", body: fd });
  },
  rollback: (slug: string, version: number) =>
    call(`/api/sites/${slug}/rollback`, { method: "POST", body: JSON.stringify({ version }) }),
  remove: (slug: string) => call(`/api/sites/${slug}`, { method: "DELETE" }),
};
