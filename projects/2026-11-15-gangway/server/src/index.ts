import path from "node:path";
import { createApp } from "./app.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 3003);
const token = process.env.GANGWAY_TOKEN ?? "dev-token";
const store = new Store(path.resolve(process.env.DATA_DIR ?? "./data"));
createApp(store, { token, baseDomain: process.env.BASE_DOMAIN }).listen(port, () => {
  console.log(`Gangway listening on http://localhost:${port} (token: ${process.env.GANGWAY_TOKEN ? "from env" : "dev-token"})`);
});
