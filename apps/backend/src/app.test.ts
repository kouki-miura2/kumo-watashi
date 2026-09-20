import { expect, test } from "vite-plus/test";
import { createApp } from "./app.ts";
import type { StatusRepository } from "./repositories/status.interface.ts";

test("GET / returns the repository's status", async () => {
  const statusRepository: StatusRepository = { getStatus: async () => ({ status: "ok" }) };
  const app = createApp({ statusRepository });

  const res = await app.request("/");

  expect(await res.json()).toEqual({ status: "ok" });
});
