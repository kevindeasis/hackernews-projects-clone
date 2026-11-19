import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 3009);
const store = new Store(path.resolve(process.env.DATA_DIR ?? "./data"));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
createApp(store, clientDist).listen(port, () => console.log(`CurveFit clone on http://localhost:${port}`));
