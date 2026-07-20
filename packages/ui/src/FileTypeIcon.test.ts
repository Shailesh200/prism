import { describe, expect, it } from "vitest";
import { resolveFileType } from "./file-type.js";

describe("FileTypeIcon tones", () => {
  it("maps common IDE extensions", () => {
    expect(resolveFileType("app.ts").tone).toBe("ts");
    expect(resolveFileType("app.tsx").badge).toBe("TSX");
    expect(resolveFileType("main.js").tone).toBe("js");
    expect(resolveFileType("styles.css").tone).toBe("css");
  });
});
