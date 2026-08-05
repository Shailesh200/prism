import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/graph-engine",
    include: ["src/**/*.test.ts"],
  },
});
