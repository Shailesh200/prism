import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/shared-integration",
    include: ["src/**/*.integration.test.ts"],
    // These spawn git against throwaway repositories. An explicit ceiling
    // here, never in the unit config (plan P22).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
