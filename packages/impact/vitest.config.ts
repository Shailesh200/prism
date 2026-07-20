import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/impact",
    include: ["src/**/*.test.ts"],
  },
});
