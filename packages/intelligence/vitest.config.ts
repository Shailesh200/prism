import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/intelligence",
    include: ["src/**/*.test.ts"],
  },
});
