import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const app = createApp(openDb());
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
const port = Number(process.env.PORT ?? 3017);
app.listen(port, () => console.log(`Extreme Puzzles API on http://localhost:${port}`));
