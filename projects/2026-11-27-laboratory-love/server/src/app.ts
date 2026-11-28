import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import * as store from "./store.js";

export interface AppOptions {
  adminToken?: string;
  now?: () => Date;
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new store.HttpError(400, "Bad id");
  return id;
};

export function createApp(db: Db, opts: AppOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const adminToken = opts.adminToken ?? "dev-admin";
  const app = express();
  app.use(cors());
  app.use(express.json());

  const admin = (req: Request, _res: Response, next: NextFunction) => {
    if (req.header("x-admin-token") !== adminToken) return next(new store.HttpError(401, "Admin token required"));
    next();
  };

  // Lazily apply auto-refunds so expiry never depends on a cron job.
  app.use("/api", (_req, _res, next) => {
    store.sweepExpired(db, now());
    next();
  });

  app.get("/api/products", (req, res) => {
    res.json(
      store.listProducts(db, now(), {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      }),
    );
  });

  app.get("/api/products/:id", (req, res) => {
    const id = idParam(req);
    const p = store.withProgress(db, store.getProduct(db, id), now());
    res.json({ ...p, pledges: store.listPledges(db, id), results: store.getResults(db, id) });
  });

  const suggestSchema = z.object({
    name: z.string().trim().min(1).max(120),
    brand: z.string().trim().min(1).max(80),
    category: z.string().trim().min(1).max(60),
    description: z.string().trim().max(1000).optional(),
  });
  app.post("/api/products", (req, res) => {
    res.status(201).json(store.suggestProduct(db, now(), suggestSchema.parse(req.body)));
  });

  app.post("/api/products/:id/approve", admin, (req, res) => {
    const { goal_cents } = z.object({ goal_cents: z.number().int().min(100) }).parse(req.body);
    res.json(store.approveProduct(db, idParam(req), goal_cents, now()));
  });

  const pledgeSchema = z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email(),
    amount_cents: z.number().int().positive(),
  });
  app.post("/api/products/:id/pledges", (req, res) => {
    res.status(201).json(store.addPledge(db, idParam(req), now(), pledgeSchema.parse(req.body)));
  });

  const resultsSchema = z.object({
    results: z
      .array(
        z.object({
          lot: z.string().min(1),
          analyte: z.string().min(1),
          value_ng_g: z.number().nonnegative().nullable(),
          loq_ng_g: z.number().positive(),
        }),
      )
      .min(1),
  });
  app.post("/api/products/:id/results", admin, (req, res) => {
    const { results } = resultsSchema.parse(req.body);
    res.status(201).json(store.publishResults(db, idParam(req), results, now()));
  });

  app.post("/api/admin/sweep", admin, (_req, res) => res.json(store.sweepExpired(db, now())));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof store.HttpError) return void res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return void res.status(400).json({ error: err.issues.map((i) => i.message).join("; ") });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}
