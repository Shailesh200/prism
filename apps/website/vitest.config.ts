import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/website",
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
  },
});
