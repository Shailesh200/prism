import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(
  fileURLToPath(new URL("./tokens.css", import.meta.url)),
  "utf8",
);

describe("UXPilot dark tokens (ADR-0014)", () => {
  it("uses the dark navy canvas and panels", () => {
    expect(tokens).toContain("--prism-canvas: #0a0e1a");
    expect(tokens).toContain("--prism-panel: #131926");
  });

  it("uses cyan brand + violet accent", () => {
    expect(tokens).toContain("--prism-brand: #00c2c2");
    expect(tokens).toContain("--prism-violet: #6c63ff");
  });

  it("uses Inter + JetBrains Mono", () => {
    expect(tokens).toMatch(/--prism-font:\s*"Inter"/);
    expect(tokens).toMatch(/--prism-mono:\s*"JetBrains Mono"/);
  });

  it("keeps signal accent colors", () => {
    expect(tokens).toContain("--prism-risk: #f59e0b");
    expect(tokens).toContain("--prism-safe: #10b981");
  });

  it("defines density overrides", () => {
    expect(tokens).toContain('data-density="comfortable"');
    expect(tokens).toContain('data-density="compact"');
    expect(tokens).toContain('data-prism-density="comfortable"');
    expect(tokens).toContain("--prism-space-xs: 6px");
    expect(tokens).toContain("--prism-space-xs: 2px");
  });

  it("defines light theme overrides and system prefers-color-scheme", () => {
    expect(tokens).toContain('data-theme="light"');
    expect(tokens).toContain("--prism-ink: #191c1d");
    expect(tokens).toContain("--prism-on-brand: #ffffff");
    expect(tokens).toContain("--prism-panel: #ffffff");
    expect(tokens).toContain("@media (prefers-color-scheme: light)");
    expect(tokens).toContain('data-theme="system"');
  });
});
