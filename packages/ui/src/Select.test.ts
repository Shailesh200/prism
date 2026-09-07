import { describe, expect, it } from "vitest";
import { selectClosesOnScroll } from "./Select.js";

describe("selectClosesOnScroll", () => {
  it("keeps the menu open when the options list itself scrolls", () => {
    const inner = {};
    const list = { contains: (node: unknown) => node === inner };
    expect(selectClosesOnScroll(list, inner)).toBe(false);
  });

  it("closes when the page or drawer scrolls", () => {
    const list = { contains: () => false };
    expect(selectClosesOnScroll(list, {})).toBe(true);
    expect(selectClosesOnScroll(null, {})).toBe(true);
  });
});
