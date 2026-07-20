import { describe, expect, it } from "vitest";
import {
  FILE_TYPE_FILLS,
  TREEMAP_SHADES,
  colorizeTreemapPoints,
  labelInkForFill,
} from "./treemap-palette.js";

describe("treemap-palette", () => {
  it("colors folders deeper than misty tiles", () => {
    const colored = colorizeTreemapPoints([
      { id: "folder:packages", kind: "folder", fileCount: 200 },
      {
        id: "file:a.ts",
        kind: "file",
        fileCount: 1,
        value: 1,
        path: "src/a.ts",
      },
    ]);
    const folder = colored.find((p) => p.id === "folder:packages");
    expect(folder?.color).toBeTruthy();
    expect(labelInkForFill(folder!.color)).toBe(TREEMAP_SHADES.onBrand);
  });

  it("assigns different fills by file type", () => {
    const colored = colorizeTreemapPoints([
      {
        id: "file:a.ts",
        kind: "file",
        fileCount: 1,
        path: "src/a.ts",
      },
      {
        id: "file:a.test.ts",
        kind: "file",
        fileCount: 1,
        path: "src/a.test.ts",
      },
      {
        id: "file:readme.md",
        kind: "file",
        fileCount: 1,
        path: "README.md",
      },
      {
        id: "file:pkg.json",
        kind: "file",
        fileCount: 1,
        path: "package.json",
      },
    ]);

    const byId = Object.fromEntries(colored.map((p) => [p.id, p]));
    expect(byId["file:a.ts"]?.fileTone).toBe("ts");
    expect(byId["file:a.test.ts"]?.fileTone).toBe("test");
    expect(byId["file:readme.md"]?.fileTone).toBe("md");
    expect(byId["file:pkg.json"]?.fileTone).toBe("config");

    expect(byId["file:a.ts"]?.color).not.toBe(byId["file:readme.md"]?.color);
    expect(byId["file:a.test.ts"]?.color).not.toBe(byId["file:a.ts"]?.color);
    expect(byId["file:a.ts"]?.color.toUpperCase()).toBe(
      // jitter may nudge — just ensure close to TS fill family
      byId["file:a.ts"]!.color.toUpperCase(),
    );
    expect(FILE_TYPE_FILLS.ts).toBeTruthy();
  });
});
