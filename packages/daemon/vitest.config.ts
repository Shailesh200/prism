import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/daemon",
    include: ["src/**/*.test.ts"],
    // The server tests index a real fixture through Core.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
