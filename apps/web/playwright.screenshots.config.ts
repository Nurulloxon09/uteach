import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** `pnpm screenshots`: capture uteach and build reference comparisons (05-ui.md §7). */
export default defineConfig({
  ...base,
  testDir: "./e2e/screenshots",
  testIgnore: undefined,
  retries: 0,
  reporter: "list",
});
