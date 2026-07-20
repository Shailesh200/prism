import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/intelligence-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
