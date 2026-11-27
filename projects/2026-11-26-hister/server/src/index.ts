import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const dbPath = process.env.DB_PATH ?? "./data/hister.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const app = createApp(openDb(dbPath));

const clientDist = path.resolve(process.cwd(), "../client/dist");
if (fs.existsSync(clientDist)) app.use(express.static(clientDist));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Hister on http://localhost:${port}`));
