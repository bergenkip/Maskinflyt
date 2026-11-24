import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Makes the app screens shown on the start page (public/screens), with
// made-up data in a local Supabase. Not part of CI. Steps: docs/HANDOFF.md.
const root = path.resolve(__dirname, "../..");
const servers = Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : [];

export default defineConfig({
  ...base,
  testDir: ".",
  outputDir: path.join(root, "test-results/demo-run"),
  fullyParallel: false,
  workers: 1,
  webServer: servers.map((server) => ({ ...server, cwd: root })),
});
