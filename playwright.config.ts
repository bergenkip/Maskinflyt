import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// The app e-mails through a local stand-in for Resend (e2e/resend-stub.mjs; same address in e2e/helpers.ts).
const resendStub = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lets a preinstalled Chromium be used where downloads are not possible.
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: "node e2e/resend-stub.mjs",
      url: `${resendStub}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run start -- --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      // Not a key: the stand-in only checks that the app sends it.
      env: { ...(process.env as Record<string, string>), RESEND_API_KEY: "stub-not-a-key", RESEND_API_URL: resendStub },
    },
  ],
});
