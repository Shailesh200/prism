import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { trustSystemCertificateAuthorities } from "./system-ca.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

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

describe("worker child TLS", () => {
  it("trusts the OS store in its own process", async () => {
    // The worker child is spawned as a fresh Node process, so the host MCP
    // calling this does nothing for it. Without this call the Cursor SDK fails
    // with "Network request failed" behind corporate HTTPS interception.
    const source = await readFile(join(srcDir, "worker-child.ts"), "utf8");
    expect(source).toContain("trustSystemCertificateAuthorities()");
  });
});
