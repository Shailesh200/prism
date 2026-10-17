import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/core-integration",
    include: ["src/**/*.integration.test.ts"],
    // Each test indexes a real repository, spawns git or runs the repo's own
    // checks: seconds alone, longer under a parallel suite. An explicit
    // ceiling here, never in the unit config (plan P22).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
