import { expect, test } from "vite-plus/test";
import { fn } from "./index.ts";

test("fn", () => {
  expect(fn()).toBe("Hello, tsdown!");
});
