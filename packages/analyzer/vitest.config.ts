import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/analyzer",
    include: ["src/**/*.test.ts"],
  },
});
