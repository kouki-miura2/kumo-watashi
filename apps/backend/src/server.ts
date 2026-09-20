/// <reference types="node" />
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createStatusRepository } from "./repositories/status.memory.ts";

const app = createApp({ statusRepository: createStatusRepository() });
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
