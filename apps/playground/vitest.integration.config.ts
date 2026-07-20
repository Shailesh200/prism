import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@prism/playground-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
