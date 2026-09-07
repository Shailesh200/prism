import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    name: "@repo-prism/dispatch-hub",
    include: ["src/**/*.test.ts"],
  },
});
