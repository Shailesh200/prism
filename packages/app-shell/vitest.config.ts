import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/app-shell",
    include: ["src/**/*.test.ts"],
  },
});
