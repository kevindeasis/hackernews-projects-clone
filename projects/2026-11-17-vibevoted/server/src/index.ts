import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { buildPanel } from "./judges.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 3008);
const store = new Store(path.resolve(process.env.DATA_DIR ?? "./data"));
const panel = buildPanel({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
createApp(store, panel, clientDist).listen(port, () => {
  console.log(`VibeVoted clone on http://localhost:${port} (judges: ${process.env.ANTHROPIC_API_KEY ? "LLM" : "heuristic"})`);
});
