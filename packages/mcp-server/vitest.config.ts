import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/mcp-server",
    include: ["src/**/*.test.ts"],
  },
});
