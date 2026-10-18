import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolvePrismBin,
  writeInstallRecord,
  installRecordPath,
} from "./prism-bin.js";

function exe(dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, "#!/bin/sh\n");
  chmodSync(p, 0o755);
  return p;
}
const tmp = () => mkdtempSync(join(tmpdir(), "prism-bin-"));

describe.skipIf(process.platform === "win32")(
  "resolvePrismBin (plan §2.2)",
  () => {
    it("BIN-1 PRISM_MCP_BIN wins", () => {
      const t = tmp();
      const bin = exe(t, "custom");
      expect(
        resolvePrismBin({
          env: { PRISM_HOME: t, PATH: "", PRISM_MCP_BIN: bin },
        }),
      ).toEqual({ ok: true, bin, source: "env" });
    });
    it("BIN-2 install.json bin comes before PATH", () => {
      const t = tmp();
      const bin = exe(join(t, "inst"), "prism-mcp");
      exe(join(t, "path"), "prism-mcp");
      const env = { PRISM_HOME: t, PATH: join(t, "path") };
      writeInstallRecord(
        { version: "2.0.0", bin, installedAt: "x", hosts: [] },
        env,
      );
      expect(resolvePrismBin({ env })).toMatchObject({
        bin,
        source: "install-json",
      });
    });
    it("BIN-3 PATH, then pack candidates", () => {
      const t = tmp();
      const onPath = exe(join(t, "path"), "prism-mcp");
      expect(
        resolvePrismBin({ env: { PRISM_HOME: t, PATH: join(t, "path") } }),
      ).toMatchObject({ bin: onPath, source: "path" });
      const pack = exe(join(t, "pack"), "bin.js");
      expect(
        resolvePrismBin({
          env: { PRISM_HOME: t, PATH: "" },
          packCandidates: [pack],
        }),
      ).toMatchObject({ bin: pack, source: "pack" });
    });
    it("BIN-4 nothing found → install.missing_bin, never npx", () => {
      const t = tmp();
      writeFileSync(installRecordPath({ PRISM_HOME: t }), "{bad");
      const out = resolvePrismBin({ env: { PRISM_HOME: t, PATH: "" } });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.reason).toBe("install.missing_bin");
        expect(out.tried.join(" ")).toMatch(/install.json invalid/);
        expect(out.tried.join(" ")).not.toMatch(/npx/);
      }
    });
  },
);
