import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { name: "@prism/docs", include: ["src/**/*.test.ts"] },
});
