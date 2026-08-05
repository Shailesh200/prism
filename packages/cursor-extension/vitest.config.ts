import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/cursor-extension",
    include: ["src/**/*.test.ts"],
  },
});
