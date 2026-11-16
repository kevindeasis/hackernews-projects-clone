import Database from "better-sqlite3";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 500;
const RESERVED = new Set(["api", "s", "admin", "www", "assets", "static", "health"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface DeployFile {
  path: string;
  data: Buffer;
}
export interface SiteRow {
  slug: string;
  name: string;
  created_at: string;
  active_version: number;
}
export interface VersionRow {
  slug: string;
  version: number;
  created_at: string;
  file_count: number;
  bytes: number;
  note: string;
}

const ADJ = ["quick", "calm", "brave", "lucky", "sunny", "misty", "tiny", "witty", "bold", "gentle"];
const NOUN = ["otter", "harbor", "anchor", "lantern", "falcon", "pebble", "maple", "comet", "river", "sparrow"];

export function randomSlug(): string {
  const pick = (a: string[]) => a[randomInt(a.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${randomInt(1000, 9999)}`;
}

export function validateSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "Slug must be 3-40 chars: lowercase letters, digits, hyphens");
  if (RESERVED.has(slug)) throw new HttpError(400, `Slug "${slug}" is reserved`);
  return slug;
}

/** Normalise and validate a path from an upload. Rejects traversal, absolute paths and hidden dirs. */
export function sanitizePath(p: string): string {
  const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!norm || norm.includes("\0") || norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) {
    throw new HttpError(400, `Invalid file path: ${JSON.stringify(p)}`);
  }
  const parts = norm.split("/");
  if (parts.some((s) => s === ".." || s === "." || s === "")) {
    throw new HttpError(400, `Invalid file path: ${JSON.stringify(p)}`);
  }
  if (parts.some((s) => s.startsWith("."))) throw new HttpError(400, `Hidden files are not allowed: ${p}`);
  return parts.join("/");
}

/** Extract files from a zip buffer, stripping a single wrapping top-level folder and junk entries. */
export function filesFromZip(buf: Buffer): DeployFile[] {
  let entries;
  try {
    entries = new AdmZip(buf).getEntries().filter((e) => !e.isDirectory);
  } catch {
    throw new HttpError(400, "Could not read zip archive");
  }
  entries = entries.filter((e) => !e.entryName.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(e.entryName));
  if (entries.length > MAX_FILES) throw new HttpError(413, `Too many files (max ${MAX_FILES})`);
  let names = entries.map((e) => e.entryName.replace(/\\/g, "/"));
  const tops = new Set(names.map((n) => n.split("/")[0]));
  if (tops.size === 1 && names.every((n) => n.includes("/")) && !names.includes("index.html")) {
    const prefix = [...tops][0] + "/";
    names = names.map((n) => n.slice(prefix.length));
  }
  return entries.map((e, i) => ({ path: names[i], data: e.getData() }));
}

export class Store {
  db: Database.Database;
  sitesDir: string;

  constructor(public dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.sitesDir = path.join(dataDir, "sites");
    fs.mkdirSync(this.sitesDir, { recursive: true });
    this.db = new Database(dataDir === ":memory:" ? ":memory:" : path.join(dataDir, "gangway.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sites (
        slug TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, active_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS versions (
        slug TEXT NOT NULL REFERENCES sites(slug) ON DELETE CASCADE,
        version INTEGER NOT NULL, created_at TEXT NOT NULL, file_count INTEGER NOT NULL,
        bytes INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (slug, version)
      );
    `);
    this.db.pragma("foreign_keys = ON");
  }

  versionDir(slug: string, version: number) {
    return path.join(this.sitesDir, slug, `v${version}`);
  }

  getSite(slug: string): SiteRow | undefined {
    return this.db.prepare("SELECT * FROM sites WHERE slug = ?").get(slug) as SiteRow | undefined;
  }

  listSites(): (SiteRow & { versions: number; bytes: number; updated_at: string })[] {
    return this.db
      .prepare(
        `SELECT s.*, COUNT(v.version) AS versions,
                COALESCE((SELECT bytes FROM versions WHERE slug = s.slug AND version = s.active_version), 0) AS bytes,
                COALESCE(MAX(v.created_at), s.created_at) AS updated_at
         FROM sites s LEFT JOIN versions v ON v.slug = s.slug
         GROUP BY s.slug ORDER BY updated_at DESC`,
      )
      .all() as any;
  }

  listVersions(slug: string): VersionRow[] {
    return this.db.prepare("SELECT * FROM versions WHERE slug = ? ORDER BY version DESC").all(slug) as VersionRow[];
  }

  deploy(opts: { slug?: string; name?: string; files: DeployFile[]; note?: string }) {
    const slug = validateSlug(opts.slug ?? randomSlug());
    let files = opts.files.map((f) => ({ path: sanitizePath(f.path), data: f.data }));
    if (files.length === 0) throw new HttpError(400, "No files to deploy");
    if (files.length > MAX_FILES) throw new HttpError(413, `Too many files (max ${MAX_FILES})`);
    if (new Set(files.map((f) => f.path)).size !== files.length) throw new HttpError(400, "Duplicate file paths");
    // A lone HTML file is treated as the site's index page.
    if (files.length === 1 && !files[0].path.includes("/") && /\.html?$/i.test(files[0].path)) {
      files = [{ path: "index.html", data: files[0].data }];
    }
    if (!files.some((f) => f.path === "index.html")) throw new HttpError(400, "Deploy must include an index.html");
    const bytes = files.reduce((n, f) => n + f.data.length, 0);
    if (bytes > MAX_TOTAL_BYTES) throw new HttpError(413, `Deploy too large (max ${MAX_TOTAL_BYTES / 1024 / 1024} MB)`);

    const now = new Date().toISOString();
    const existing = this.getSite(slug);
    const version = existing ? (this.db.prepare("SELECT MAX(version) m FROM versions WHERE slug=?").get(slug) as any).m + 1 : 1;
    const dir = this.versionDir(slug, version);
    for (const f of files) {
      const dest = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
    }
    this.db.transaction(() => {
      if (!existing) {
        this.db.prepare("INSERT INTO sites VALUES (?,?,?,?)").run(slug, opts.name || slug, now, version);
      } else {
        this.db.prepare("UPDATE sites SET active_version = ?, name = ? WHERE slug = ?").run(version, opts.name || existing.name, slug);
      }
      this.db.prepare("INSERT INTO versions VALUES (?,?,?,?,?,?)").run(slug, version, now, files.length, bytes, opts.note ?? "");
    })();
    return { slug, version, fileCount: files.length, bytes, created: !existing };
  }

  rollback(slug: string, version: number) {
    const v = this.db.prepare("SELECT 1 FROM versions WHERE slug=? AND version=?").get(slug, version);
    if (!v) throw new HttpError(404, "Version not found");
    this.db.prepare("UPDATE sites SET active_version = ? WHERE slug = ?").run(version, slug);
  }

  deleteSite(slug: string) {
    if (!this.getSite(slug)) throw new HttpError(404, "Site not found");
    this.db.prepare("DELETE FROM sites WHERE slug = ?").run(slug);
    fs.rmSync(path.join(this.sitesDir, slug), { recursive: true, force: true });
  }

  /** Resolve a request path to a file in the site's active version, or undefined. Guards against traversal. */
  resolveFile(slug: string, reqPath: string): string | undefined {
    const site = this.getSite(slug);
    if (!site) return undefined;
    const root = this.versionDir(slug, site.active_version);
    let rel: string;
    try {
      rel = decodeURIComponent(reqPath);
    } catch {
      return undefined;
    }
    if (rel.includes("\0")) return undefined;
    const target = path.resolve(root, "." + path.posix.normalize("/" + rel));
    if (target !== root && !target.startsWith(root + path.sep)) return undefined;
    for (const c of [target, path.join(target, "index.html"), target + ".html"]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return undefined;
  }
}
