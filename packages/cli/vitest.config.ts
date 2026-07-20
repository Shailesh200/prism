import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/cli",
    include: ["src/**/*.test.ts"],
  },
});
