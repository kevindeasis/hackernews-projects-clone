import type { Db } from "./db.js";

export type AlertEvent = {
  kind: "down" | "recovered";
  monitorName: string;
  target: string;
  cause?: string | null;
  at: number;
};

export function formatAlert(e: AlertEvent): string {
  const when = new Date(e.at).toISOString();
  return e.kind === "down"
    ? `🔴 ${e.monitorName} is DOWN (${e.target}) — ${e.cause ?? "check failed"} at ${when}`
    : `🟢 ${e.monitorName} has RECOVERED (${e.target}) at ${when}`;
}

export type Sender = (url: string, body: unknown) => Promise<void>;

const defaultSender: Sender = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`webhook responded ${res.status}`);
};

/** POST a Slack/Discord-compatible payload to every configured channel. Never throws. */
export async function dispatchAlert(db: Db, event: AlertEvent, send: Sender = defaultSender): Promise<number> {
  const channels = db.prepare("SELECT name, url FROM alert_channels").all() as { name: string; url: string }[];
  const text = formatAlert(event);
  let delivered = 0;
  await Promise.all(
    channels.map(async (c) => {
      try {
        // `text` is Slack's field, `content` is Discord's.
        await send(c.url, { text, content: text, event });
        delivered++;
      } catch (err) {
        console.error(`[alerts] channel "${c.name}" failed:`, (err as Error).message);
      }
    }),
  );
  return delivered;
}
