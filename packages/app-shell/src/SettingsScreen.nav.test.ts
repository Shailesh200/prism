import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("SettingsScreen sections", () => {
  it("has no job-runner section now that Prism runs no jobs", () => {
    const source = readFileSync(join(here, "SettingsScreen.tsx"), "utf8");
    expect(source).not.toContain('id: "prismate"');
    expect(source).not.toContain("PrismateSettings");
  });

  it("keeps full wipe in General and drops the old Clear Data path", () => {
    const settings = readFileSync(join(here, "SettingsScreen.tsx"), "utf8");
    const wipe = readFileSync(join(here, "WipePrismDataCard.tsx"), "utf8");
    expect(settings).toContain("WipePrismDataCard");
    expect(settings).not.toMatch(/onClearData|CLEAR_DATA_WARNING|Clear Data/);
    expect(wipe).toContain("Wipe all Prism data");
    expect(wipe).toContain("set-wipe__help");
    expect(wipe).toContain("set-wipe__row");
    const css = readFileSync(join(here, "settings-extra.css"), "utf8");
    expect(css).toMatch(/\.set-wipe__help[\s\S]*max-width:\s*none/);
    expect(css).toMatch(/\.set-wipe__row[\s\S]*justify-content:\s*flex-end/);
  });
});
