/**
 * Arc's review of start-consent: an atomic 1.x move, backups never written
 * over, symlinked configs kept as links, dangling links backed up, and plan
 * mode refusing async writers.
 */
import * as fs from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LENSES } from "@repo-prism/shared/lens-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backupConfigs,
  configBackupPath,
  reserveBackupDir,
} from "./backups.js";
import { fileList } from "./consent-copy.js";
import { atomicWrite, planWrites } from "./hosts.js";
import { wipe1x } from "./wipe.js";

/** Lets one test make `renameSync` fail for one destination. */
const failRename = vi.hoisted(() => ({
  to: null as string | null,
  times: Infinity,
}));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const renameSync: typeof real.renameSync = (from, to) => {
    if (
      failRename.to !== null &&
      String(to) === failRename.to &&
      failRename.times-- > 0
    ) {
      const error = new Error(
        `EBUSY: resource busy, rename '${String(to)}'`,
      ) as NodeJS.ErrnoException;
      error.code = "EBUSY";
      throw error;
    }
    return real.renameSync(from, to);
  };
  return { ...real, renameSync, default: { ...real, renameSync } };
});

const dirs: string[] = [];
afterEach(() => {
  failRename.to = null;
  failRename.times = Infinity;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-consent-fix-"));
  dirs.push(dir);
  return dir;
}
function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}
const custom = (id: string, extra: Record<string, unknown> = {}) => ({
  ...DEFAULT_LENSES[0],
  id,
  name: `Custom ${id}`,
  seededDefault: false,
  ...extra,
});

/** A 1.x home: indexes, a hub, one good and one bad lens, a config. */
function home1x(): { env: NodeJS.ProcessEnv; home: string; root: string } {
  const root = temp();
  const home = join(root, ".prism");
  for (const n of [1, 2])
    put(join(home, "workspaces", `ws${n}`, "index.db"), "x");
  put(join(home, "hub", "state.json"), "{}");
  put(join(home, "lenses", "good.json"), JSON.stringify(custom("good")));
  put(
    join(home, "lenses", "bad.json"),
    JSON.stringify(custom("bad", { checks: ["nope"] })),
  );
  put(
    join(home, "config.json"),
    JSON.stringify({ strength: "lite", legacyKey: 1 }),
  );
  return { env: { PRISM_HOME: home }, home, root };
}

/** Every file under `dir` with its content, for before/after comparisons. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).toSorted()) {
      const path = join(d, name);
      const info = lstatSync(path);
      if (info.isDirectory()) walk(path, `${rel}${name}/`);
      else
        out[`${rel}${name}`] = info.isSymbolicLink()
          ? `-> ${readlinkSync(path)}`
          : readFileSync(path, "utf8");
    }
  };
  walk(dir, "");
  return out;
}

describe("1.x move is one step (Arc review, must-fix 1)", () => {
  it("moves the whole home in one rename and writes back what 2.x keeps", async () => {
    const { env, home } = home1x();
    const before = tree(home);
    const out = await wipe1x({ env, now: new Date("2026-10-17T10:00:00Z") });
    expect(out.kind).toBe("wiped");
    if (out.kind !== "wiped") return;
    // Everything 1.x had is in the backup, bad lens sorted aside with a reason.
    const backed = tree(out.backupDir);
    expect(backed["workspaces/ws1/index.db"]).toBe("x");
    expect(backed["hub/state.json"]).toBe("{}");
    expect(backed["config.json"]).toBe(before["config.json"]);
    expect(backed["lenses/good.json"]).toBe(before["lenses/good.json"]);
    expect(
      backed["lenses-not-compatible/1-bad.json"] ??
        backed["lenses-not-compatible/0-bad.json"],
    ).toBe(before["lenses/bad.json"]);
    expect(Object.keys(backed).some((k) => k.endsWith("REMOVED.txt"))).toBe(
      true,
    );
    // The new home: kept lens, kept key, version.json; no 1.x leftovers.
    expect(existsSync(join(home, "workspaces"))).toBe(false);
    expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8"))).toEqual(
      { strength: "lite" },
    );
    const kept = JSON.parse(
      readFileSync(join(home, "lenses", "lenses.json"), "utf8"),
    ) as { lenses: { id: string }[] };
    expect(kept.lenses.map((l) => l.id)).toEqual(["good"]);
    expect(
      JSON.parse(readFileSync(join(home, "version.json"), "utf8")).major,
    ).toBe(2);
    // No staging folder left behind.
    expect(
      readdirSync(join(home, "..")).filter((n) => n.includes(".new-")),
    ).toEqual([]);
  });

  it("a failure moving the home leaves it exactly as it was", async () => {
    const { env, home, root } = home1x();
    const before = tree(home);
    const backupRoot = reserveBackupDir(
      join(root, ".prism-backups", "20261017T100000"),
    );
    failRename.to = join(backupRoot, "1x");
    await expect(wipe1x({ env, backupRoot })).rejects.toThrow(/EBUSY/);
    expect(tree(home)).toEqual(before);
    expect(existsSync(join(backupRoot, "1x"))).toBe(false);
    expect(readdirSync(root).filter((n) => n.includes(".new-"))).toEqual([]);
  });

  it("a failure putting the new home in place moves the old one back", async () => {
    const { env, home, root } = home1x();
    const before = tree(home);
    const backupRoot = reserveBackupDir(
      join(root, ".prism-backups", "20261017T100000"),
    );
    failRename.to = home; // the staging → ~/.prism rename, once
    failRename.times = 1;
    await expect(wipe1x({ env, backupRoot })).rejects.toThrow(/EBUSY/);
    failRename.to = null;
    expect(tree(home)).toEqual(before);
    expect(existsSync(join(backupRoot, "1x"))).toBe(false);
    expect(readdirSync(root).filter((n) => n.includes(".new-"))).toEqual([]);
    // And the next run still works, into the same reserved folder.
    const out = await wipe1x({ env, backupRoot });
    expect(out.kind).toBe("wiped");
  });

  it("a symlinked entry inside ~/.prism moves as the link (WIPE-6)", async () => {
    const { env, home, root } = home1x();
    const outside = join(root, "elsewhere");
    put(join(outside, "keep.txt"), "mine");
    symlinkSync(outside, join(home, "linked"));
    const out = await wipe1x({ env });
    if (out.kind !== "wiped") throw new Error(out.kind);
    expect(lstatSync(join(out.backupDir, "linked")).isSymbolicLink()).toBe(
      true,
    );
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("mine");
  });
});

describe("1.x move, when even the way back fails", () => {
  it("loses nothing and says where the data is", async () => {
    const { env, home, root } = home1x();
    const before = tree(home);
    const backupRoot = reserveBackupDir(
      join(root, ".prism-backups", "20261017T100000"),
    );
    failRename.to = home; // staging → home, and the move back
    const error = await wipe1x({ env, backupRoot }).catch(
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(join(backupRoot, "1x"));
    expect(error.message).toContain("to undo");
    const kept = tree(join(backupRoot, "1x"));
    for (const [file, text] of Object.entries(before))
      expect(kept[file]).toBe(text);
  });
});

describe("backups are never written over (Arc review, must-fix 2)", () => {
  it("an existing folder for the same second gets -2, then -3", () => {
    const base = join(temp(), ".prism-backups", "20261017T100000");
    expect(reserveBackupDir(base)).toBe(base);
    put(join(base, "configs", "x.json"), "first run");
    expect(reserveBackupDir(base)).toBe(`${base}-2`);
    expect(reserveBackupDir(base)).toBe(`${base}-3`);
    expect(readFileSync(join(base, "configs", "x.json"), "utf8")).toBe(
      "first run",
    );
  });

  it("two backups in the same second keep both copies", () => {
    const root = temp();
    const config = join(root, ".claude.json");
    const base = join(root, ".prism-backups", "20261017T100000");
    put(config, "v1");
    const first = reserveBackupDir(base);
    backupConfigs(first, [config], root);
    put(config, "v2");
    const second = reserveBackupDir(base);
    backupConfigs(second, [config], root);
    expect(readFileSync(configBackupPath(first, config, root), "utf8")).toBe(
      "v1",
    );
    expect(readFileSync(configBackupPath(second, config, root), "utf8")).toBe(
      "v2",
    );
  });
});

describe("symlinked configs (Arc review, should-fix)", () => {
  function linked(): { root: string; link: string; target: string } {
    const root = temp();
    const target = join(root, "dotfiles", "claude.json");
    put(target, '{"mine":true}\n');
    const link = join(root, ".claude.json");
    symlinkSync(target, link);
    return { root, link, target };
  }

  it("a write goes through to the target and the link stays a link", () => {
    const { link, target } = linked();
    atomicWrite(link, '{"prism":true}\n');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(target);
    expect(readFileSync(target, "utf8")).toBe('{"prism":true}\n');
    expect(
      readdirSync(join(target, "..")).filter((n) => n.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("the backup keeps the target's content, which is what changes", () => {
    const { root, link } = linked();
    const dir = reserveBackupDir(join(root, ".prism-backups", "s"));
    const [copy] = backupConfigs(dir, [link], root);
    expect(lstatSync(copy!).isSymbolicLink()).toBe(false);
    expect(readFileSync(copy!, "utf8")).toBe('{"mine":true}\n');
  });

  it("plan mode marks it, and the consent list says where it points", () => {
    const { link, target } = linked();
    const [write] = planWrites(() => atomicWrite(link, "{}\n"));
    expect(write).toEqual({
      path: link,
      kind: "file",
      exists: true,
      linkTo: fs.realpathSync(target),
    });
    // Both full paths (Muse), the label after them or on the next line.
    const lines = fileList([
      {
        agent: "Claude Code",
        path: "~/.claude/settings.json",
        role: "hooks",
        linkTo: "~/dotfiles/claude/settings.json",
      },
    ]);
    expect(lines[0]).toContain(
      "~/.claude/settings.json (symlink → ~/dotfiles/claude/settings.json)",
    );
    expect(lines.join("\n")).toContain("Prism hooks");
  });
});

describe("dangling symlinks (Arc review, should-fix)", () => {
  function dangling(): { root: string; link: string; target: string } {
    const root = temp();
    const target = join(root, "dotfiles", "missing.json");
    const link = join(root, ".claude.json");
    symlinkSync(target, link);
    return { root, link, target };
  }

  it("counts as existing in the plan, so a real run backs it up", () => {
    const { link } = dangling();
    const [write] = planWrites(() => atomicWrite(link, "{}\n"));
    expect(write?.exists).toBe(true);
  });

  it("is backed up as the link itself, not skipped", () => {
    const { root, link, target } = dangling();
    const dir = reserveBackupDir(join(root, ".prism-backups", "s"));
    const [copy] = backupConfigs(dir, [link], root);
    expect(lstatSync(copy!).isSymbolicLink()).toBe(true);
    expect(readlinkSync(copy!)).toBe(target);
  });

  it("a write creates the file it points at and keeps the link", () => {
    const { link, target } = dangling();
    atomicWrite(link, "{}\n");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("{}\n");
  });
});

describe("plan mode is synchronous only (Arc review, should-fix)", () => {
  it("planWrites refuses a writer that returns a promise", () => {
    expect(() =>
      planWrites((async () => undefined) as unknown as () => void),
    ).toThrow(/synchronous/);
  });

  it("the fs mock passes renames through when no failure is set", () => {
    const dir = temp();
    put(join(dir, "a"), "1");
    fs.renameSync(join(dir, "a"), join(dir, "b"));
    expect(readFileSync(join(dir, "b"), "utf8")).toBe("1");
  });
});
