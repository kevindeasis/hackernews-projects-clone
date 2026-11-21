import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { formatTime, parseTime, search, type Network } from "./raptor.js";

export function createApp(net: Network, clientDist?: string) {
  const app = express();
  app.use(cors());

  app.get("/api/stations", (_req, res) => {
    res.json([...net.stops.values()].sort((a, b) => a.name.localeCompare(b.name)));
  });

  const q = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    depart: z.string().default("08:00"),
    maxChanges: z.coerce.number().int().min(0).max(6).default(4),
    minChange: z.coerce.number().int().min(0).max(30).default(3),
  });

  app.get("/api/journeys", (req, res) => {
    const p = q.safeParse(req.query);
    if (!p.success) return res.status(400).json({ error: p.error.issues.map((i) => i.message).join("; ") });
    const { from, to, depart, maxChanges, minChange } = p.data;
    const t = parseTime(depart);
    if (t === null) return res.status(400).json({ error: "depart must be HH:MM" });
    if (!net.stops.has(from) || !net.stops.has(to)) return res.status(404).json({ error: "unknown station" });
    if (from === to) return res.status(400).json({ error: "origin and destination must differ" });
    const journeys = search(net, { from, to, depart: t, maxChanges, minChange }).map((j) => ({
      ...j,
      depLabel: formatTime(j.dep),
      arrLabel: formatTime(j.arr),
      duration: j.arr - j.dep,
      legs: j.legs.map((l) => ({ ...l, depLabel: formatTime(l.dep), arrLabel: formatTime(l.arr), fromName: net.stops.get(l.from)!.name, toName: net.stops.get(l.to)!.name })),
    }));
    res.json({ journeys });
  });

  if (clientDist && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }
  return app;
}
