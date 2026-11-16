import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import { z } from "zod";
import { HttpError, MAX_TOTAL_BYTES, Store, filesFromZip } from "./store.js";

export interface AppConfig {
  token: string;
  /** Optional apex domain; if set, `<slug>.<domain>` hosts serve the site too. */
  baseDomain?: string;
}

export function createApp(store: Store, config: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.enable("strict routing");
  app.use(cors());
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_TOTAL_BYTES, files: 500 } });

  const sendSite = (slug: string, rest: string, res: Response, next: NextFunction) => {
    const file = store.resolveFile(slug, rest);
    if (!file) return res.status(404).type("text").send("Not found");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(file, (err) => err && next(err));
  };

  // Subdomain hosting: slug.example.com -> site
  if (config.baseDomain) {
    app.use((req, res, next) => {
      const host = (req.hostname || "").toLowerCase();
      const suffix = "." + config.baseDomain;
      if (host.endsWith(suffix)) return sendSite(host.slice(0, -suffix.length), req.path, res, next);
      next();
    });
  }

  // Path-based hosting: /s/<slug>/...
  app.get("/s/:slug", (req, res) => res.redirect(301, `/s/${req.params.slug}/`));
  app.get(/^\/s\/([^/]+)\/(.*)$/, (req, res, next) => sendSite(req.params[0], req.params[1], res, next));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use((req, res, next) => {
    const auth = req.header("authorization") ?? "";
    if (auth !== `Bearer ${config.token}`) return res.status(401).json({ error: "Invalid or missing token" });
    next();
  });
  api.use(express.json({ limit: "12mb" }));

  api.get("/sites", (_req, res) => res.json(store.listSites()));

  api.get("/sites/:slug", (req, res) => {
    const site = store.getSite(req.params.slug);
    if (!site) throw new HttpError(404, "Site not found");
    res.json({ ...site, versions: store.listVersions(site.slug) });
  });

  const jsonDeploy = z.object({
    slug: z.string().optional(),
    name: z.string().max(100).optional(),
    note: z.string().max(200).optional(),
    html: z.string().min(1),
  });

  /**
   * Deploy via JSON ({html}) or multipart: `archive` (a .zip) or `files` (one or more files; the
   * original relative path is sent in the `paths` field(s), falling back to the filename).
   */
  api.post("/deploy", upload.fields([{ name: "archive", maxCount: 1 }, { name: "files" }]), (req, res) => {
    const out = (r: ReturnType<Store["deploy"]>) =>
      res.status(r.created ? 201 : 200).json({ ...r, url: `/s/${r.slug}/` });
    const uploaded = req.files as Record<string, Express.Multer.File[]> | undefined;
    if (uploaded?.archive?.[0]) {
      return out(store.deploy({ slug: req.body.slug || undefined, name: req.body.name, note: req.body.note, files: filesFromZip(uploaded.archive[0].buffer) }));
    }
    if (uploaded?.files?.length) {
      const paths: string[] = [req.body.paths ?? []].flat();
      const files = uploaded.files.map((f, i) => ({ path: paths[i] || f.originalname, data: f.buffer }));
      return out(store.deploy({ slug: req.body.slug || undefined, name: req.body.name, note: req.body.note, files }));
    }
    const body = jsonDeploy.parse(req.body);
    out(store.deploy({ slug: body.slug, name: body.name, note: body.note, files: [{ path: "index.html", data: Buffer.from(body.html) }] }));
  });

  api.post("/sites/:slug/rollback", (req, res) => {
    const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
    store.rollback(req.params.slug, version);
    res.json({ ok: true });
  });

  api.delete("/sites/:slug", (req, res) => {
    store.deleteSite(req.params.slug);
    res.status(204).end();
  });

  app.use("/api", api);

  // Serve the built client if present
  app.use(express.static(new URL("../../client/dist", import.meta.url).pathname));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    if (err instanceof multer.MulterError) return res.status(413).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}
