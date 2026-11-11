import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { seed } from "./seed.js";

const dbPath = process.env.DB_PATH ?? "./data/temples.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
if ((db.prepare("SELECT COUNT(*) AS n FROM temples").get() as { n: number }).n === 0) seed(db);

const app = createApp(db);
const clientDist = path.resolve(process.cwd(), "../client/dist");
if (fs.existsSync(clientDist)) app.use(express.static(clientDist));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));
