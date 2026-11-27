import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { extractText } from "./extract.js";
import { parseQuery } from "./query.js";
import { search, upsertPage } from "./store.js";

const mem = () => openDb(":memory:");

describe("parseQuery", () => {
  it("ANDs terms and prefixes the last one", () => {
    expect(parseQuery("rust async").match).toBe('"rust" AND "async"*');
  });
  it("handles phrases, exclusions and domain filters", () => {
    const q = parseQuery('"event loop" -python domain:www.Example.com node');
    expect(q.domain).toBe("example.com");
    expect(q.match).toBe('"event loop" AND "node"* NOT "python"');
  });
  it("neutralises FTS syntax characters", () => {
    expect(parseQuery('foo* (bar) OR').match).toBe('"foo" AND "bar" AND "OR"*');
  });
  it("returns null for empty input", () => {
    expect(parseQuery("   ").match).toBeNull();
  });
});

describe("extractText", () => {
  it("drops scripts/nav and reads title", () => {
    const r = extractText("<html><title>Hi</title><body><nav>menu</nav><script>x()</script><main>Hello  world</main></body></html>");
    expect(r).toEqual({ title: "Hi", text: "Hello world" });
  });
});

describe("store", () => {
  it("indexes and finds pages, with stemming and snippets", () => {
    const db = mem();
    upsertPage(db, { url: "https://a.com/1", title: "Cooking pasta", text: "How to boil water for the perfect spaghetti" });
    upsertPage(db, { url: "https://b.com/2", title: "Gardening", text: "Growing tomatoes in pots" });
    const hits = search(db, "tomato");
    expect(hits.map((h) => h.url)).toEqual(["https://b.com/2"]);
    expect(hits[0].snippet).toContain("<mark>");
    expect(search(db, "pasta -spaghetti")).toHaveLength(0);
  });
  it("re-visiting bumps visits and does not duplicate", () => {
    const db = mem();
    upsertPage(db, { url: "https://a.com/1#x", title: "T", text: "alpha" });
    upsertPage(db, { url: "https://a.com/1", title: "T2", text: "alpha beta" });
    const hits = search(db, "beta");
    expect(hits).toHaveLength(1);
    expect(hits[0].visits).toBe(2);
    expect(hits[0].title).toBe("T2");
  });
  it("title matches outrank body matches", () => {
    const db = mem();
    upsertPage(db, { url: "https://a.com/body", title: "Other", text: "something about sqlite here" });
    upsertPage(db, { url: "https://a.com/title", title: "SQLite", text: "unrelated" });
    expect(search(db, "sqlite")[0].url).toBe("https://a.com/title");
  });
  it("domain filter includes subdomains", () => {
    const db = mem();
    upsertPage(db, { url: "https://blog.a.com/1", title: "x", text: "hello" });
    upsertPage(db, { url: "https://b.com/1", title: "x", text: "hello" });
    expect(search(db, "hello domain:a.com")).toHaveLength(1);
    expect(search(db, "domain:a.com")).toHaveLength(1);
  });
});

describe("api", () => {
  it("ingests via POST, fetches via injected fetcher, blocks domains", async () => {
    const db = mem();
    const app = createApp(db, { fetcher: async () => ({ title: "Fetched", text: "quokka facts" }) });
    await request(app).post("/api/pages").send({ url: "https://x.org/a", title: "Posted", text: "wombat facts" }).expect(200);
    await request(app).post("/api/pages/fetch").send({ url: "https://y.org/b" }).expect(200);
    expect((await request(app).get("/api/search?q=quokka")).body).toHaveLength(1);
    expect((await request(app).get("/api/search?q=wombat")).body).toHaveLength(1);

    await request(app).post("/api/blocklist").send({ domain: "x.org" }).expect(201);
    expect((await request(app).get("/api/search?q=wombat")).body).toHaveLength(0);
    const r = await request(app).post("/api/pages").send({ url: "https://sub.x.org/c", title: "t", text: "wombat" });
    expect(r.body).toEqual({ blocked: true });
    expect((await request(app).get("/api/stats")).body.pages).toBe(1);
  });
  it("rejects non-http urls", async () => {
    const app = createApp(mem());
    await request(app).post("/api/pages").send({ url: "ftp://x.org/a", title: "t", text: "t" }).expect(400);
  });
});
