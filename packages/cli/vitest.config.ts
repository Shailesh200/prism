import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/cli",
    include: ["src/**/*.test.ts"],
    // The integration suite spawns the built binary, so it belongs to
    // `test:integration` and must not run before `build` has happened.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
