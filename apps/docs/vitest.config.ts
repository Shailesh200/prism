import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { name: "@repo-prism/docs", include: ["src/**/*.test.ts"] },
});
