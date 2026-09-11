import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/vscode-extension",
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Indexing a fixture through the oxc parser exceeds the 5s default under
    // parallel load. See the note in packages/core/vitest.config.ts.
    // host-client re-imports the app-shell barrel between tests; that load
    // also exceeds 30s when Core is indexing fixtures on the same machine.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
