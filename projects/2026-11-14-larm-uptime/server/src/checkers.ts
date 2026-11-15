import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns/promises";
import type { TLSSocket } from "node:tls";

/** Result of one probe. Timing fields are milliseconds, per phase. */
export interface CheckResult {
  ok: boolean;
  latencyMs: number | null;
  statusCode?: number | null;
  error?: string | null;
  dnsMs?: number | null;
  tcpMs?: number | null;
  tlsMs?: number | null;
  ttfbMs?: number | null;
  transferMs?: number | null;
  certExpiresAt?: number | null;
}

export interface HttpOptions {
  url: string;
  timeoutMs: number;
  expectedStatus?: number | null;
  keyword?: string | null;
}

const now = () => performance.now();

/**
 * HTTP(S) check with a request trace: DNS, TCP connect, TLS handshake,
 * time-to-first-byte and body transfer (the same breakdown Larm shows).
 */
export function checkHttp(opts: HttpOptions): Promise<CheckResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(opts.url);
    } catch {
      return resolve({ ok: false, latencyMs: null, error: "Invalid URL" });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return resolve({ ok: false, latencyMs: null, error: "Only http(s) URLs are supported" });
    }
    const lib = url.protocol === "https:" ? https : http;
    const t0 = now();
    const t: Record<string, number> = {};
    let settled = false;
    const finish = (r: CheckResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const req = lib.request(
      url,
      { method: "GET", timeout: opts.timeoutMs, headers: { "user-agent": "larm-uptime-clone/0.1" } },
      (res) => {
        t.firstByte = now();
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          // Keep at most 1 MB for keyword matching.
          if (size < 1_000_000) chunks.push(c);
          size += c.length;
        });
        res.on("end", () => {
          const end = now();
          const status = res.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString("utf8");
          const sock = res.socket as TLSSocket;
          let certExpiresAt: number | null = null;
          if (url.protocol === "https:" && typeof sock.getPeerCertificate === "function") {
            const cert = sock.getPeerCertificate();
            if (cert && cert.valid_to) certExpiresAt = Date.parse(cert.valid_to) || null;
          }
          const statusOk = opts.expectedStatus ? status === opts.expectedStatus : status >= 200 && status < 400;
          const keywordOk = !opts.keyword || body.includes(opts.keyword);
          let error: string | null = null;
          if (!statusOk) error = `Unexpected status ${status}`;
          else if (!keywordOk) error = `Keyword "${opts.keyword}" not found`;
          const start = t.socket ?? t0;
          finish({
            ok: statusOk && keywordOk,
            latencyMs: end - t0,
            statusCode: status,
            error,
            dnsMs: t.lookup != null ? t.lookup - start : null,
            tcpMs: t.connect != null ? t.connect - (t.lookup ?? start) : null,
            tlsMs: t.secure != null && t.connect != null ? t.secure - t.connect : null,
            ttfbMs: t.firstByte - (t.secure ?? t.connect ?? start),
            transferMs: end - t.firstByte,
            certExpiresAt,
          });
        });
        res.on("error", (e) => finish({ ok: false, latencyMs: now() - t0, error: e.message }));
      },
    );
    req.on("socket", (socket) => {
      t.socket = now();
      socket.once("lookup", () => (t.lookup = now()));
      socket.once("connect", () => (t.connect = now()));
      socket.once("secureConnect", () => (t.secure = now()));
      // Literal IPs never emit "lookup"; treat DNS as zero-cost.
      if (net.isIP(url.hostname)) t.lookup = t.socket;
    });
    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, latencyMs: now() - t0, error: `Timed out after ${opts.timeoutMs}ms` });
    });
    req.on("error", (e: NodeJS.ErrnoException) =>
      finish({ ok: false, latencyMs: now() - t0, error: e.code ? `${e.code}: ${e.message}` : e.message }),
    );
    req.end();
  });
}

/** TCP port check: succeeds if a connection can be opened. */
export function checkTcp(host: string, port: number, timeoutMs: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const t0 = now();
    const socket = net.connect({ host, port });
    const done = (r: CheckResult) => {
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ ok: true, latencyMs: now() - t0, tcpMs: now() - t0 }));
    socket.once("timeout", () => done({ ok: false, latencyMs: now() - t0, error: `Timed out after ${timeoutMs}ms` }));
    socket.once("error", (e: NodeJS.ErrnoException) =>
      done({ ok: false, latencyMs: now() - t0, error: e.code ? `${e.code}: ${e.message}` : e.message }),
    );
  });
}

export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

/** DNS check: succeeds if the record type resolves to at least one answer. */
export async function checkDns(host: string, recordType: string, timeoutMs: number): Promise<CheckResult> {
  const t0 = now();
  try {
    const answer = await Promise.race([
      dns.resolve(host, recordType as DnsRecordType),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs).unref()),
    ]);
    const count = Array.isArray(answer) ? answer.length : 1;
    const ok = count > 0;
    return { ok, latencyMs: now() - t0, dnsMs: now() - t0, error: ok ? null : "No records returned" };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return { ok: false, latencyMs: now() - t0, error: err.code ? `${err.code}: ${err.message}` : err.message };
  }
}
