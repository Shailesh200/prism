import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    // Never the real HOME: every run gets a throwaway HOME and PRISM_HOME.
    globalSetup: ["../../packages/test-support/src/home-guard.ts"],
    setupFiles: ["../../packages/test-support/src/home-guard-setup.ts"],
    name: "@repo-prism/website",
    include: ["lib/**/*.test.ts"],
  },
});
