import { describe, expect, it } from "vitest";
import { parsePlaygroundView, playgroundHash } from "./hash-route.js";

describe("parsePlaygroundView", () => {
  it("maps DNA, blast, and health aliases", () => {
    expect(parsePlaygroundView("#/dna")).toBe("dna");
    expect(parsePlaygroundView("#/blast")).toBe("blast");
    expect(parsePlaygroundView("#/health")).toBe("overview");
    expect(parsePlaygroundView("#/overview")).toBe("overview");
  });

  it("ignores an empty or unknown hash", () => {
    expect(parsePlaygroundView("")).toBeUndefined();
    expect(parsePlaygroundView("#")).toBeUndefined();
    expect(parsePlaygroundView("#/nope")).toBeUndefined();
  });

  it("writes a hash the parser accepts", () => {
    expect(parsePlaygroundView(playgroundHash("dna"))).toBe("dna");
  });
});
