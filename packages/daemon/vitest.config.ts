import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Never the real HOME: every run gets a throwaway HOME and PRISM_HOME.
    globalSetup: ["../test-support/src/home-guard.ts"],
    setupFiles: ["../test-support/src/home-guard-setup.ts"],
    name: "@repo-prism/daemon",
    include: ["src/**/*.test.ts"],
    // vitest's 5 s default (plan P22): the server tests index one small
    // fixture and wait on outcomes, not sleeps.
  },
});
