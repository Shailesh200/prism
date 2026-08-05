import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/cli-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
