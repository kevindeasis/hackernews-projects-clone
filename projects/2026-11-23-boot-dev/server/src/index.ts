import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const app = createApp(openDb());
const clientDist = path.resolve(process.cwd(), "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
const port = Number(process.env.PORT ?? 3023);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
