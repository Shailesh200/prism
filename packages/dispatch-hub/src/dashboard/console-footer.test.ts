import { describe, expect, it } from "vitest";
import {
  PLAYGROUND_DEFAULT,
  consoleFooterLinks,
  spectrumUrl,
} from "./console-footer.js";

describe("spectrumUrl", () => {
  it("adds the selected repo so DNA does not index Prism by accident", () => {
    expect(
      spectrumUrl(PLAYGROUND_DEFAULT, {
        root: "/Users/me/website",
        hash: "#/dna",
      }),
    ).toBe("http://prismhq.localhost:17331/?root=%2FUsers%2Fme%2Fwebsite#/dna");
  });

  it("omits All-repos and empty roots", () => {
    expect(
      spectrumUrl("http://prismhq.localhost:17331/", { root: "all" }),
    ).toBe("http://prismhq.localhost:17331/");
    expect(spectrumUrl(PLAYGROUND_DEFAULT, { hash: "overview" })).toBe(
      "http://prismhq.localhost:17331/#/overview",
    );
  });
});

describe("consoleFooterLinks", () => {
  it("keeps website and in-app links, not Spectrum", () => {
    expect(
      consoleFooterLinks({ onCheckUpdates: () => undefined }).map(
        (link) => link.label,
      ),
    ).toEqual([
      "Repo DNA",
      "Health",
      "Wake",
      "Docs",
      "Check for updates",
      "Prism",
      "What's new",
    ]);
  });
});
