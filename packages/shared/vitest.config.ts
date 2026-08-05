import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/shared",
    include: ["src/**/*.test.ts"],
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
