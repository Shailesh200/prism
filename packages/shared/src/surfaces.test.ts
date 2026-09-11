import { describe, expect, it } from "vitest";
import { htmlLooksAwake } from "./surfaces.js";

describe("htmlLooksAwake", () => {
  it("treats the sleep down page as down", () => {
    expect(htmlLooksAwake("<h1>Prism is down</h1><p>prism wake</p>")).toBe(
      false,
    );
  });

  it("treats a live Spectrum or Dispatch document as awake", () => {
    expect(htmlLooksAwake("<title>Prism — Spectrum</title>")).toBe(true);
    expect(htmlLooksAwake("<title>Prism Dispatch</title>")).toBe(true);
  });
});
