import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/mcp-server",
    include: ["src/**/*.test.ts"],
    // The receipt, lens and snapshot tests index real fixtures and run git.
    // Alone they take a second or two; under the full parallel suite they
    // passed 5s. Same reasoning as core's config.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
