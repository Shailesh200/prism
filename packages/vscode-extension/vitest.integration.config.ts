import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/vscode-extension-integration",
    include: ["src/**/*.integration.test.ts"],
  },
});
