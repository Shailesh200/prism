import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/core",
    include: ["src/**/*.test.ts"],
    // Core's tests index real fixtures through the oxc parser, which takes a
    // few seconds per file. At the 5s default they passed alone and timed out
    // under parallel load — a flaky suite is worse than a slow one. Making the
    // indexing itself faster belongs to M-035.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
