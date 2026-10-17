import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Never the real HOME: every run gets a throwaway HOME and PRISM_HOME.
    globalSetup: ["../test-support/src/home-guard.ts"],
    setupFiles: ["../test-support/src/home-guard-setup.ts"],
    name: "@repo-prism/cli",
    include: ["src/**/*.test.ts"],
    // The integration suite spawns the built binary, so it belongs to
    // `test:integration` and must not run before `build` has happened.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
