import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/repository-map",
    include: ["src/**/*.test.ts"],
  },
});
