import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/test-support",
    include: ["src/**/*.test.ts"],
  },
});
