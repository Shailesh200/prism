import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/plugin",
    include: ["src/**/*.test.ts"],
  },
});
