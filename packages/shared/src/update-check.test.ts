import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readCachedLatest,
  UPDATE_COMMAND,
  updateLine,
  updateNotice,
} from "./update-check.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function prismHome(cache?: string): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "prism-update-"));
  dirs.push(dir);
  if (cache !== undefined) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "update.json"), cache);
  }
  return { PRISM_HOME: dir };
}

describe("update notice (PR 10)", () => {
  it("names the real npm command (prism upgrade downloads nothing)", () => {
    expect(UPDATE_COMMAND).toBe("npm i -g @repo-prism/cli@latest");
    expect(updateLine("2.0.1")).toBe(
      "Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest",
    );
    expect(updateNotice({ kind: "available", latest: "2.0.1", cached: true })).toBe(
      "prism-mcp: Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest\n",
    );
    expect(updateNotice({ kind: "current", latest: "2.0.0", cached: true })).toBeUndefined();
  });

  it("readCachedLatest reads only the cache, of any age, and never throws", () => {
    const old = JSON.stringify({ checkedAt: "2020-01-01T00:00:00Z", latest: "2.0.1" });
    expect(readCachedLatest("2.0.0", prismHome(old))).toBe("2.0.1");
    expect(readCachedLatest("2.0.1", prismHome(old))).toBeUndefined();
    expect(readCachedLatest("2.1.0", prismHome(old))).toBeUndefined();
    expect(readCachedLatest("2.0.0", prismHome())).toBeUndefined();
    expect(readCachedLatest("2.0.0", prismHome("not json"))).toBeUndefined();
    expect(readCachedLatest("2.0.0", prismHome('{"latest":7}'))).toBeUndefined();
    expect(
      readCachedLatest("2.0.0", { ...prismHome(old), PRISM_SKIP_SELF_UPDATE: "1" }),
    ).toBeUndefined();
  });
});
