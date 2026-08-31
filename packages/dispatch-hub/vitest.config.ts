import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/dispatch-hub",
    include: ["src/**/*.test.ts"],
  },
});
