import { defineConfig, devices } from "@playwright/test";
import { createSmokeFixture } from "./e2e/fixture-setup.js";

const smokeRoot = createSmokeFixture();

/**
 * Playground UI smoke (M-037 Phase 4).
 *
 * The playground is the only surface a browser can drive, and it renders the
 * same screens as the extension webview, so a failure here is a failure there.
 *
 * Deliberately not screenshot baselines: they differ by platform font
 * rendering, so on a three-OS matrix they would either be pinned to one
 * platform or fail on the other two, and a baseline that gets re-recorded to
 * make CI green has stopped being a check.
 */
export default defineConfig({
  testDir: "./e2e",
  // These drive a real index over a real repository; the default 30s is tight
  // for the first screen while indexing is still warming.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev -- --port 5174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5174",
    // Never reuse: a server already running against this checkout would put
    // the tests back on developer-local state, which is what the fixture
    // exists to avoid.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PRISM_PLAYGROUND_ROOT: smokeRoot },
    stdout: "ignore",
    stderr: "pipe",
  },
});
