import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/graph-engine-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
