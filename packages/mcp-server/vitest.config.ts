import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/mcp-server",
    include: ["src/**/*.test.ts"],
  },
});
