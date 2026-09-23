import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("SettingsScreen sections", () => {
  it("places Prismate directly under General", () => {
    const source = readFileSync(join(here, "SettingsScreen.tsx"), "utf8");
    const general = source.indexOf('{ id: "general", label: "General"');
    const prismate = source.indexOf('{ id: "prismate", label: "Prismate"');
    const indexing = source.indexOf('{ id: "indexing", label: "Indexing"');
    expect(general).toBeGreaterThan(-1);
    expect(prismate).toBeGreaterThan(general);
    expect(indexing).toBeGreaterThan(prismate);
    expect(source).toContain("PrismateSettings");
  });

  it("keeps full wipe in General and drops the old Clear Data path", () => {
    const settings = readFileSync(join(here, "SettingsScreen.tsx"), "utf8");
    const prismate = readFileSync(join(here, "PrismateSettings.tsx"), "utf8");
    expect(settings).toContain("WipePrismDataCard");
    expect(settings).not.toMatch(/onClearData|CLEAR_DATA_WARNING|Clear Data/);
    const prismateFn = prismate.indexOf("export function PrismateSettings");
    const wipeFn = prismate.indexOf("export function WipePrismDataCard");
    expect(wipeFn).toBeGreaterThan(prismateFn);
    expect(prismate.slice(prismateFn, wipeFn)).not.toContain(
      "Wipe all Prism data",
    );
    expect(prismate).toContain("set-wipe__help");
    expect(prismate).toContain("set-wipe__row");
    const css = readFileSync(join(here, "settings-extra.css"), "utf8");
    expect(css).toMatch(/\.set-wipe__help[\s\S]*max-width:\s*none/);
    expect(css).toMatch(/\.set-wipe__row[\s\S]*justify-content:\s*flex-end/);
  });
});
