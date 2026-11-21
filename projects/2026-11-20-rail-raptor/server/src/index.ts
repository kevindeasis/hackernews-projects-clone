import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadNetwork, openDb } from "./db.js";

const port = Number(process.env.PORT ?? 3020);
const db = openDb(process.env.DB_PATH ?? "./rail.sqlite");
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
createApp(loadNetwork(db), clientDist).listen(port, () => console.log(`Rail Raptor on http://localhost:${port}`));
