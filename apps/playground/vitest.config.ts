import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { name: "@repo-prism/playground", include: ["src/**/*.test.ts"] },
});
