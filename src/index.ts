import { serve } from "@hono/node-server";
import { getEnv } from "./config.js";
import { createApp } from "./server.js";

const env = getEnv();
const app = createApp(env);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Dashboard listening on http://localhost:${info.port}`);
});
