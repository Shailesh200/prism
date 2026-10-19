import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Never the real HOME: every run gets a throwaway HOME and PRISM_HOME.
    globalSetup: ["./src/home-guard.ts"],
    setupFiles: ["./src/home-guard-setup.ts"],
    name: "@repo-prism/test-support",
    include: ["src/**/*.test.ts"],
    // Tests spawn git and build fixture repos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
