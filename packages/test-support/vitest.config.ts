import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/test-support",
    include: ["src/**/*.test.ts"],
    // Tests spawn git and build fixture repos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
