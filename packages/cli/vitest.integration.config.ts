import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/cli-integration",
    include: ["src/**/*.integration.test.ts"],
    // The cross-surface suite indexes a real repository and spawns the CLI
    // (moved from mcp-server with the same ceiling, plan P22).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
