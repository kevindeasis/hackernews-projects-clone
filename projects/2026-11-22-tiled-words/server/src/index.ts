import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";

const port = Number(process.env.PORT ?? 3022);
const db = openDb(path.resolve(process.env.DATA_DIR ?? "./data", "tiled-words.db"));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
createApp(db, clientDist).listen(port, () => console.log(`Tiled Words clone on http://localhost:${port}`));
