import { describe, expect, it } from "vitest";
import { trustSystemCertificateAuthorities } from "./system-ca.js";

describe("trustSystemCertificateAuthorities", () => {
  it("merges bundled and system CAs", () => {
    const set: string[][] = [];
    const ok = trustSystemCertificateAuthorities({
      getCACertificates(type) {
        if (type === "system") return ["SYSTEM"];
        return ["BUNDLED"];
      },
      setDefaultCACertificates(certs) {
        set.push([...certs]);
      },
    });
    expect(ok).toBe(true);
    expect(set).toEqual([["BUNDLED", "SYSTEM"]]);
  });

  it("is a no-op when the Node build has no system-CA API", () => {
    expect(trustSystemCertificateAuthorities({})).toBe(false);
  });

  it("is a no-op when the OS store is empty", () => {
    expect(
      trustSystemCertificateAuthorities({
        getCACertificates: () => [],
        setDefaultCACertificates: () => {
          throw new Error("should not set");
        },
      }),
    ).toBe(false);
  });
});
