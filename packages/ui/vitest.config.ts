import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/ui",
    include: ["src/**/*.test.ts"],
  },
});
