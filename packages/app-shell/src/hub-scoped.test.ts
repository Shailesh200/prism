import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prefixHubCss } from "../scripts/scope-hub-css.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("hub-scoped.css", () => {
  it("scopes leaked primitive overrides under .console-hub", () => {
    const out = prefixHubCss(`.prism-metric-card {\n  display: flex;\n}\n`);
    expect(out).toContain(".console-hub .prism-metric-card");
    expect(out).not.toMatch(/(^|})\s*\.prism-metric-card\s*\{/);
  });

  it("leaves prepare-run copy unscoped so portaled drawers keep word spacing", () => {
    const out = prefixHubCss(
      `.prepare-job-title p {\n  overflow-wrap: break-word;\n}\n`,
    );
    expect(out).toContain(".prepare-job-title p");
    expect(out).not.toContain(".console-hub .prepare-job-title");
  });

  it("leaves the portaled skill-delete confirmation unscoped", () => {
    const out = prefixHubCss(
      `.prism-popover.skills-delete-pop {\n  width: max-content;\n}\n`,
    );
    expect(out).toContain(".prism-popover.skills-delete-pop");
    expect(out).not.toContain(".console-hub .prism-popover.skills-delete-pop");
  });

  it("leaves portaled drawer selectors unscoped", () => {
    const out = prefixHubCss(`.prism-drawer {\n  width: 70%;\n}\n`);
    expect(out).toContain(".prism-drawer {");
    expect(out).not.toContain(".console-hub .prism-drawer");
  });

  it("leaves keyframe stop selectors alone", () => {
    const out = prefixHubCss(
      `@keyframes pulse-glow {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n`,
    );
    expect(out).toContain("@keyframes pulse-glow");
    expect(out).toContain("from {");
    expect(out).not.toContain(".console-hub from");
  });

  it("is the file styles.css actually imports", () => {
    const scoped = readFileSync(join(here, "hub-scoped.css"), "utf8");
    expect(scoped).toContain(".console-hub .prism-metric-card");
    expect(scoped).not.toMatch(/^\.prism-metric-card\s*\{/m);
  });
});
