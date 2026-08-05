import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@repo-prism/playground-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
