import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/cursor-extension-integration",
    include: ["src/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
