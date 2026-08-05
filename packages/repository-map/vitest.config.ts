import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/repository-map",
    include: ["src/**/*.test.ts"],
  },
});
