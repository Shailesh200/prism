import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/indexer-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
