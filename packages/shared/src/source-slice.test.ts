import { describe, expect, it } from "vitest";
import {
  PREPARE_BODY_MAX_LINES,
  lineAtOffset,
  signatureLine,
  symbolSlice,
} from "./source-slice.js";

describe("source-slice (P2)", () => {
  const src = `export function foo(a: number): number {
  return a + 1;
}
`;

  it("lineAtOffset is 1-based", () => {
    expect(lineAtOffset("a\nb\nc", 0)).toBe(1);
    expect(lineAtOffset("a\nb\nc", 4)).toBe(3);
  });

  it("signatureLine is one clipped line without trailing brace", () => {
    const sig = signatureLine(src, 0, src.length);
    expect(sig).toBe("export function foo(a: number): number");
    expect(sig.length).toBeLessThanOrEqual(160);
  });

  it("symbolSlice reports line span and body", () => {
    const slice = symbolSlice(src, 0, src.trimEnd().length);
    expect(slice.line).toBe(1);
    expect(slice.lineCount).toBeLessThanOrEqual(PREPARE_BODY_MAX_LINES);
    expect(slice.body).toContain("return a + 1");
  });
});
