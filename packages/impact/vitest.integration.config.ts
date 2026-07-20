import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/impact-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
