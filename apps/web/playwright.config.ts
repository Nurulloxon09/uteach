import { defineConfig, devices } from "@playwright/test";

/**
 * E2E needs a running local Supabase (`pnpm db:start`) and the web app's env (.env.local).
 * Phones +99899000000x use fixed SMS codes from supabase/config.toml [auth.sms.test_otp].
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "pnpm start" : "pnpm dev",
        url: "http://localhost:3000/en/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
