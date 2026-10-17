import { describe, expect, it } from "vitest";
import {
  languageGate,
  repoLanguageSupport,
  sourceLanguageOf,
} from "./language-support.js";

describe("language support (plan §4.6, LANG)", () => {
  it("LANG-1 a Python repo is unsupported with the 2.0 message", () => {
    const e = languageGate([
      "cli.py",
      "core.py",
      "io.py",
      "net.py",
      "a.py",
      "setup.cfg",
      "scripts/x.js",
    ]);
    expect(e?.code).toBe("PRISM_UNSUPPORTED");
    expect(e?.message).toBe(
      "Prism 2.0 supports TypeScript and JavaScript only. Python files are not analysed.",
    );
    expect(e?.details).toEqual({ reason: "language", language: "Python" });
  });

  it("LANG-2 mixed repo: TS target analysed, .py target refused", () => {
    const paths = ["a.ts", "b.ts", "tool.py"];
    expect(languageGate(paths, "a.ts")).toBeNull();
    expect(languageGate(paths, "tool.py")?.message).toContain("Python");
  });

  it("LANG-3 the 20% threshold", () => {
    expect(
      repoLanguageSupport(["a.go", "b.go", "c.go", "d.go", "e.ts"]).supported,
    ).toBe(true);
    expect(
      repoLanguageSupport(["a.go", "b.go", "c.go", "d.go", "e.go", "f.ts"])
        .supported,
    ).toBe(false);
  });

  it("LANG-4 non-source files never count either way", () => {
    expect(sourceLanguageOf("README.md")).toBeNull();
    expect(repoLanguageSupport(["README.md", "x.json"]).supported).toBe(true);
    expect(languageGate(["a.ts"], "docs/x.md")).toBeNull();
  });
});
