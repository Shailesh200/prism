import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/dispatch",
    include: ["src/**/*.test.ts"],
  },
});
