import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/shared",
    include: ["src/**/*.test.ts"],
    // Suites that index a real repository, spawn git or run a repo's own
    // checks live in *.integration.test.ts (plan P22). Unit tests keep
    // vitest's 5 s default: one that needs more is an integration test.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/**/*.integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: [
        "src/result.ts",
        "src/errors.ts",
        "src/ids.ts",
        "src/paths.ts",
        "src/schemas.ts",
      ],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
