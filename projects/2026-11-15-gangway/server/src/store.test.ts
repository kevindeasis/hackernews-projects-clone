import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import request from "supertest";
import { Store, sanitizePath, filesFromZip, validateSlug, HttpError } from "./store.js";
import { createApp } from "./app.js";

const auth = { Authorization: "Bearer t" };
let store: Store;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "gw-")));
  app = createApp(store, { token: "t", baseDomain: "gw.test" });
});

describe("path + slug validation", () => {
  it("rejects traversal and hidden files", () => {
    for (const p of ["../x", "a/../../x", "/etc/passwd", "a//b", ".env", "a/.git/x", "C:\\x"]) {
      expect(() => sanitizePath(p)).toThrow(HttpError);
    }
    expect(sanitizePath("css\\site.css")).toBe("css/site.css");
  });
  it("validates slugs", () => {
    expect(validateSlug("my-site")).toBe("my-site");
    expect(() => validateSlug("API")).toThrow();
    expect(() => validateSlug("api")).toThrow();
    expect(() => validateSlug("-x-")).toThrow();
  });
});

describe("zip handling", () => {
  it("strips a single wrapping folder and macOS junk", () => {
    const z = new AdmZip();
    z.addFile("site/index.html", Buffer.from("hi"));
    z.addFile("site/a.css", Buffer.from("b{}"));
    z.addFile("__MACOSX/site/._index.html", Buffer.from("x"));
    expect(filesFromZip(z.toBuffer()).map((f) => f.path).sort()).toEqual(["a.css", "index.html"]);
  });
});

describe("deploy / versions / rollback", () => {
  it("versions on redeploy and supports rollback", () => {
    store.deploy({ slug: "demo", files: [{ path: "page.html", data: Buffer.from("v1") }] });
    const r2 = store.deploy({ slug: "demo", files: [{ path: "index.html", data: Buffer.from("v2") }], note: "second" });
    expect(r2.version).toBe(2);
    expect(fs.readFileSync(store.resolveFile("demo", "")!, "utf8")).toBe("v2");
    store.rollback("demo", 1);
    expect(fs.readFileSync(store.resolveFile("demo", "")!, "utf8")).toBe("v1");
    expect(store.listVersions("demo")).toHaveLength(2);
  });
  it("requires index.html", () => {
    expect(() => store.deploy({ slug: "nope", files: [{ path: "a/b.html", data: Buffer.from("x") }] })).toThrow(/index.html/);
  });
  it("cannot serve files outside the site root", () => {
    store.deploy({ slug: "demo", files: [{ path: "index.html", data: Buffer.from("x") }] });
    expect(store.resolveFile("demo", "../../gangway.db")).toBeUndefined();
    expect(store.resolveFile("demo", "%2e%2e/%2e%2e/gangway.db")).toBeUndefined();
  });
});

describe("HTTP API", () => {
  it("requires auth", async () => {
    await request(app).get("/api/sites").expect(401);
  });
  it("deploys html, serves it by path and by subdomain, then deletes", async () => {
    const d = await request(app).post("/api/deploy").set(auth).send({ slug: "hello", html: "<h1>Hello</h1>" }).expect(201);
    expect(d.body.url).toBe("/s/hello/");
    expect((await request(app).get("/s/hello/").expect(200)).text).toContain("Hello");
    await request(app).get("/").set("Host", "hello.gw.test").expect(200);
    await request(app).get("/s/hello/missing.js").expect(404);
    await request(app).post("/api/deploy").set(auth).send({ slug: "hello", html: "<h1>Two</h1>" }).expect(200);
    const info = await request(app).get("/api/sites/hello").set(auth).expect(200);
    expect(info.body.active_version).toBe(2);
    await request(app).post("/api/sites/hello/rollback").set(auth).send({ version: 1 }).expect(200);
    expect((await request(app).get("/s/hello/")).text).toContain("Hello");
    await request(app).delete("/api/sites/hello").set(auth).expect(204);
    await request(app).get("/s/hello/").expect(404);
  });
  it("deploys a zip archive with assets", async () => {
    const z = new AdmZip();
    z.addFile("index.html", Buffer.from("<link href=a.css>"));
    z.addFile("a.css", Buffer.from("body{color:red}"));
    await request(app).post("/api/deploy").set(auth).field("slug", "zipped").attach("archive", z.toBuffer(), "s.zip").expect(201);
    const css = await request(app).get("/s/zipped/a.css").expect(200);
    expect(css.headers["content-type"]).toMatch(/css/);
  });
  it("auto-generates a slug when none is given", async () => {
    const r = await request(app).post("/api/deploy").set(auth).send({ html: "x" }).expect(201);
    expect(r.body.slug).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  });
});
