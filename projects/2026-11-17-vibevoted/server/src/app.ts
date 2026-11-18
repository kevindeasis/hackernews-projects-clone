import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { DEFAULT_CRITERIA, type Judge } from "./judges.js";
import { aggregate } from "./ranking.js";
import type { Store } from "./store.js";

const competitionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  criteria: z.array(z.string().trim().min(1).max(40)).min(1).max(8).default(DEFAULT_CRITERIA),
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().max(500).default(""),
  tagline: z.string().trim().max(200).default(""),
  description: z.string().trim().max(5000).default(""),
});

export function createApp(store: Store, panel: Judge[], staticDir?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const evaluateProducts = async (comp: ReturnType<Store["getCompetition"]> & {}, productIds?: number[]) => {
    const products = store.listProducts(comp.id).filter((p) => !productIds || productIds.includes(p.id));
    await Promise.all(
      products.flatMap((p) =>
        panel.map(async (j) => store.saveEvaluation(p.id, j.id, await j.evaluate(p, comp.criteria))),
      ),
    );
    return products.length;
  };

  const leaderboard = (comp: NonNullable<ReturnType<Store["getCompetition"]>>) => {
    const products = store.listProducts(comp.id);
    const evals = store.listEvaluations(comp.id);
    const ranked = aggregate(evals.map((e) => ({ productId: e.product_id, judgeId: e.judge_id, overall: e.overall })));
    const rankOf = new Map(ranked.map((r) => [r.productId, r]));
    const rows = products.map((p) => ({
      product: p,
      ...(rankOf.get(p.id) ?? { rank: null, mean: null, stdev: null, borda: 0, judges: 0 }),
      evaluations: evals.filter((e) => e.product_id === p.id),
    }));
    rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.product.id - b.product.id);
    return rows;
  };

  app.get("/api/judges", (_req, res) => res.json(panel.map(({ id, name, persona }) => ({ id, name, persona }))));
  app.get("/api/competitions", (_req, res) => res.json(store.listCompetitions()));
  app.post("/api/competitions", (req, res) => {
    const b = competitionSchema.parse(req.body);
    res.status(201).json(store.createCompetition(b.title, b.description, b.criteria));
  });
  app.get("/api/competitions/:slug", (req, res) => {
    const comp = store.getCompetition(req.params.slug);
    if (!comp) return res.status(404).json({ error: "Competition not found" });
    res.json({ competition: comp, leaderboard: leaderboard(comp) });
  });
  app.post("/api/competitions/:slug/products", async (req, res) => {
    const comp = store.getCompetition(req.params.slug);
    if (!comp) return res.status(404).json({ error: "Competition not found" });
    const product = store.addProduct(comp.id, productSchema.parse(req.body));
    if (req.query.evaluate !== "false") await evaluateProducts(comp, [product.id]);
    res.status(201).json(product);
  });
  app.post("/api/competitions/:slug/evaluate", async (req, res) => {
    const comp = store.getCompetition(req.params.slug);
    if (!comp) return res.status(404).json({ error: "Competition not found" });
    res.json({ evaluated: await evaluateProducts(comp) });
  });
  app.delete("/api/products/:id", (req, res) =>
    store.deleteProduct(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: "Product not found" }),
  );

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });
  return app;
}
