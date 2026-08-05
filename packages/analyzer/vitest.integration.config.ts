import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/analyzer-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
