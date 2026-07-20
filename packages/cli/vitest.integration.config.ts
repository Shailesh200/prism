import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/cli-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
