import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/host-session",
    include: ["src/**/*.test.ts"],
  },
});
