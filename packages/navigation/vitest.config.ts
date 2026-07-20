import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/navigation",
    include: ["src/**/*.test.ts"],
  },
});
