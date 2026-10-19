import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/daemon",
    include: ["src/**/*.test.ts"],
    // vitest's 5 s default (plan P22): the server tests index one small
    // fixture and wait on outcomes, not sleeps.
  },
});
