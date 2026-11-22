import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const port = Number(process.env.PORT ?? 3021);
const db = openDb(path.resolve(process.env.DATA_DIR ?? "./data", "niblet.db"));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
createApp(db, clientDist).listen(port, () => console.log(`Niblet clone on http://localhost:${port}`));
