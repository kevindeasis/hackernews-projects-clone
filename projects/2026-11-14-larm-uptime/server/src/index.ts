import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { pruneChecks, startScheduler } from "./engine.js";

const port = Number(process.env.PORT ?? 3002);
const db = openDb(process.env.DB_PATH ?? "./larm.db");
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const app = createApp(db, { serveStatic: fs.existsSync(clientDist) ? clientDist : undefined });
startScheduler(db);
setInterval(() => pruneChecks(db), 6 * 3_600_000).unref();

app.listen(port, () => console.log(`Larm clone listening on http://localhost:${port}`));
