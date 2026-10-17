import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Never the real HOME: every run gets a throwaway HOME and PRISM_HOME.
    globalSetup: ["../test-support/src/home-guard.ts"],
    setupFiles: ["../test-support/src/home-guard-setup.ts"],
    name: "@repo-prism/shared-integration",
    include: ["src/**/*.integration.test.ts"],
    // These spawn git against throwaway repositories. An explicit ceiling
    // here, never in the unit config (plan P22).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
