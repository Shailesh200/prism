import { describe, expect, it } from "vitest";
import {
  irisPaneHash,
  isWakeHash,
  parseIrisPane,
  parsePlaygroundView,
  pickPlaygroundRoot,
  playgroundHash,
  rootFromSearch,
  withRootSearch,
} from "./hash-route.js";

describe("parsePlaygroundView", () => {
  it("maps DNA, blast, and health aliases", () => {
    expect(parsePlaygroundView("#/dna")).toBe("dna");
    expect(parsePlaygroundView("#/blast")).toBe("blast");
    expect(parsePlaygroundView("#/health")).toBe("overview");
    expect(parsePlaygroundView("#/review")).toBe("review");
    expect(parsePlaygroundView("#/explain")).toBe("explain");
    expect(parsePlaygroundView("#/impact")).toBe("impact");
    expect(parsePlaygroundView("#/map")).toBe("impact");
    expect(parsePlaygroundView("#/iris")).toBe("iris");
    expect(parsePlaygroundView("#/iris/prepare")).toBe("iris");
    expect(parsePlaygroundView("#/lenses")).toBe("lenses");
    expect(parsePlaygroundView("#/jobs")).toBe("impact");
  });

  it("keeps Envelope and Prepare as Iris panes, not extra tabs", () => {
    expect(parseIrisPane("#/iris")).toBeUndefined();
    expect(parseIrisPane("#/iris/envelope")).toBe("envelope");
    expect(parseIrisPane("#/iris/prepare")).toBe("prepare");
    expect(irisPaneHash("prepare")).toBe("#/iris/prepare");
    expect(irisPaneHash(undefined)).toBe("#/iris");
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

describe("isWakeHash", () => {
  it("treats #/wake as the shared Wake screen", () => {
    expect(isWakeHash("#/wake")).toBe(true);
    expect(isWakeHash("#/overview")).toBe(false);
  });
});

describe("pickPlaygroundRoot", () => {
  it("keeps a query or already-chosen repo instead of Dispatch default", () => {
    expect(
      pickPlaygroundRoot({
        prev: "/repos/port-pilot",
        fromQuery: null,
        defaultRoot: "/repos/prism",
      }),
    ).toBe("/repos/port-pilot");
    expect(
      pickPlaygroundRoot({
        prev: "/repos/old",
        fromQuery: "/repos/port-pilot",
        defaultRoot: "/repos/prism",
      }),
    ).toBe("/repos/port-pilot");
    expect(
      pickPlaygroundRoot({
        prev: null,
        fromQuery: null,
        defaultRoot: "/repos/prism",
      }),
    ).toBe("/repos/prism");
  });
});

describe("rootFromSearch", () => {
  it("reads the Dispatch-selected repo from the query", () => {
    expect(rootFromSearch("?root=/Users/me/website&x=1")).toBe(
      "/Users/me/website",
    );
    expect(rootFromSearch("")).toBeNull();
  });

  it("keeps hash and other params when writing root", () => {
    expect(
      withRootSearch("/", "?zoom=package", "#/dna", "/Users/me/website"),
    ).toBe("/?zoom=package&root=%2FUsers%2Fme%2Fwebsite#/dna");
  });
});
