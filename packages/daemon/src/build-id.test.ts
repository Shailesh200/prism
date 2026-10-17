import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { daemonBuildIdFor } from "./client.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("daemonBuildIdFor", () => {
  it("is the server version plus the stamp file's build time", () => {
    const pkg = mkdtempSync(join(tmpdir(), "prism-build-id-"));
    dirs.push(pkg);
    writeFileSync(join(pkg, "package.json"), '{"version":"2.0.0"}');
    mkdirSync(join(pkg, "dist"));
    const stamp = join(pkg, "dist", "daemon-attach.js");
    writeFileSync(stamp, "");
    expect(daemonBuildIdFor(stamp)).toBe(
      `2.0.0+${Math.trunc(statSync(stamp).mtimeMs)}`,
    );
    expect(daemonBuildIdFor(join(pkg, "dist", "missing.js"))).toBeUndefined();
  });
});
