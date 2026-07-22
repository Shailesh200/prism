import { describe, expect, it } from "vitest";
import {
  materialIconForFile,
  materialIconForFolder,
  materialSvg,
} from "./material-file-icon.js";

describe("materialIconForFile", () => {
  it("resolves special filenames before extensions", () => {
    expect(materialIconForFile("vitest.config.ts")).toBe("vitest");
    expect(materialIconForFile("tsconfig.json")).toBe("tsconfig");
    expect(materialIconForFile("package.json")).toBe("nodejs");
  });

  it("resolves by extension (incl. compound + path input)", () => {
    expect(materialIconForFile("src/app/main.ts")).toBe("typescript");
    expect(materialIconForFile("Button.tsx")).toBe("react_ts");
    expect(materialIconForFile("index.jsx")).toBe("react");
    expect(materialIconForFile("styles.css")).toBe("css");
    expect(materialIconForFile("notes.md")).toBe("markdown");
  });

  it("falls back to the generic file icon for unknown types", () => {
    expect(materialIconForFile("mystery.zzz")).toBe("file");
    expect(materialIconForFile("LICENSEabc")).toBe("file");
  });
});

describe("materialIconForFolder", () => {
  it("maps common folder names and open state", () => {
    expect(materialIconForFolder("src")).toBe("folder-src");
    expect(materialIconForFolder("src", true)).toBe("folder-src-open");
    expect(materialIconForFolder("components")).toBe("folder-components");
  });

  it("falls back to the generic folder icon", () => {
    expect(materialIconForFolder("zzz-unknown")).toBe("folder");
    expect(materialIconForFolder("zzz-unknown", true)).toBe("folder-open");
  });
});

describe("materialSvg", () => {
  it("returns inlined svg markup for resolved icons", () => {
    expect(materialSvg("typescript")).toMatch(/^<svg/);
    expect(materialSvg("folder")).toMatch(/^<svg/);
    expect(materialSvg("file")).toMatch(/^<svg/);
  });

  it("returns null for icons that are not bundled", () => {
    expect(materialSvg("definitely-not-an-icon")).toBeNull();
  });
});
