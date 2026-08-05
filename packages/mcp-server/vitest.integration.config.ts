import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/mcp-server-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
