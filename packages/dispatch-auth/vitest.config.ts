import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/dispatch-auth",
    include: ["src/**/*.test.ts"],
  },
});
