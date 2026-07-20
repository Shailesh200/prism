import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/graph-engine",
    include: ["src/**/*.test.ts"],
  },
});
