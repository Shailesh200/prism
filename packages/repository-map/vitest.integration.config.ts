import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/repository-map-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
