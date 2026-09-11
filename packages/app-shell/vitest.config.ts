import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo-prism/app-shell",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Component tests need a DOM. The pure tests do not care, and paying
    // jsdom's startup once is simpler than maintaining two projects.
    environment: "jsdom",
    // jsdom defaults to `about:blank`, which is an opaque origin, and an opaque
    // origin has no storage — `window.localStorage` comes back undefined and
    // every settings-backed component silently takes its fallback path.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["./vitest.setup.ts"],
    // jsdom screens take a few seconds each. At the 5s default they passed
    // alone and timed out under parallel load with Core fixture indexing.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
