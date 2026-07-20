import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/ui",
    include: ["src/**/*.test.ts"],
  },
});
