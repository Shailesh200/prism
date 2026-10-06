import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/checks",
    include: ["src/**/*.test.ts"],
  },
});
