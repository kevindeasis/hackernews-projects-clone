import Database from "better-sqlite3";

export type Db = Database.Database;

/** Open (and migrate) a SQLite database. Use ":memory:" in tests. */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('http','tcp','dns','heartbeat')),
      target TEXT NOT NULL DEFAULT '',        -- URL (http), host (tcp/dns)
      port INTEGER,                           -- tcp only
      interval_sec INTEGER NOT NULL DEFAULT 180,
      timeout_ms INTEGER NOT NULL DEFAULT 10000,
      expected_status INTEGER,                -- http: exact status; null = any 2xx/3xx
      keyword TEXT,                           -- http: body must contain this
      record_type TEXT DEFAULT 'A',           -- dns
      heartbeat_token TEXT UNIQUE,            -- heartbeat only
      grace_sec INTEGER NOT NULL DEFAULT 60,  -- heartbeat: extra wait after interval
      fail_threshold INTEGER NOT NULL DEFAULT 2, -- consecutive failures before "down"
      paused INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','up','down')),
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_checked_at INTEGER,
      last_ping_at INTEGER,                   -- heartbeat only
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      ok INTEGER NOT NULL,
      latency_ms REAL,
      status_code INTEGER,
      error TEXT,
      dns_ms REAL, tcp_ms REAL, tls_ms REAL, ttfb_ms REAL, transfer_ms REAL,
      cert_expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_checks_monitor_at ON checks(monitor_id, at);
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      resolved_at INTEGER,
      cause TEXT
    );
    CREATE TABLE IF NOT EXISTS alert_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL            -- webhook URL (Slack-compatible JSON {text})
    );
    CREATE TABLE IF NOT EXISTS status_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS status_page_monitors (
      page_id INTEGER NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      PRIMARY KEY (page_id, monitor_id)
    );
  `);
  return db;
}
