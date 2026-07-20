import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@prism/vscode-extension",
    include: ["src/**/*.test.ts"],
  },
});
