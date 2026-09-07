import { defineConfig, devices } from "@playwright/test";

/** Port 3000 is often taken (Docker, another dev server); PORT overrides it. */
const PORT = process.env.PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npm run start",
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      NODE_ENV: "production",
      PORT,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
