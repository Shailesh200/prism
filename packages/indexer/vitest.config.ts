import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/indexer",
    include: ["src/**/*.test.ts"],
  },
});
