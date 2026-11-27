import * as cheerio from "cheerio";

export interface Extracted {
  title: string;
  text: string;
}

const MAX_BODY = 200_000;

/** Extract the readable text of an HTML document. */
export function extractText(html: string): Extracted {
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg, iframe, nav, footer, header, form").remove();
  const title = ($("title").first().text() || $("h1").first().text() || "").replace(/\s+/g, " ").trim();
  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = root.text().replace(/\s+/g, " ").trim().slice(0, MAX_BODY);
  return { title, text };
}

export function normalizeUrl(raw: string): { url: string; domain: string } {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs are supported");
  u.hash = "";
  const domain = u.hostname.toLowerCase().replace(/^www\./, "");
  return { url: u.toString(), domain };
}

export async function fetchPage(url: string): Promise<Extracted> {
  const res = await fetch(url, {
    headers: { "user-agent": "hister-clone/0.1 (+personal search)" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html") && !type.includes("text")) throw new Error(`Unsupported content type: ${type}`);
  return extractText(await res.text());
}
