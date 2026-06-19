/**
 * FormBridge HTTP server entrypoint.
 *
 * This is the binary the Docker image runs (`node dist/server.js`). It starts the
 * Hono app from the app factory on PORT (default 3000) using @hono/node-server.
 *
 * Intakes are not loaded from disk here — the deployment is expected to register
 * intakes via the API/MCP layer, so we start with the full app factory and an
 * empty intake set (health/readiness/metrics/submission routes are all wired).
 *
 * ponytail: empty intake list keeps this entrypoint config-free; intake loading
 * from a file/env is deferred until there's a concrete deployment that needs it.
 */

import { serve } from "@hono/node-server";
import { createFormBridgeAppWithIntakes } from "./app.js";
import { getLogger } from "./logging.js";

const app = createFormBridgeAppWithIntakes([]);

const PORT = Number(process.env["PORT"]) || 3000;
const HOST = process.env["HOST"] || "0.0.0.0";

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  getLogger().info(
    { logger: "server", address: info.address, port: info.port },
    `FormBridge listening on http://${info.address}:${info.port}`
  );
});

export default app;
