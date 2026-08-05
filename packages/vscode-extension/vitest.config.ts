import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/vscode-extension",
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Indexing a fixture through the oxc parser exceeds the 5s default under
    // parallel load. See the note in packages/core/vitest.config.ts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
