import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/analyzer",
    include: ["src/**/*.test.ts"],
  },
});
