import { defineConfig } from "@playwright/test";

// Prérequis : `bun run db:start` et `bun run functions:serve` (Supabase local).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "bun run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
