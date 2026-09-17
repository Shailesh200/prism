import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

let root: string;
let ws: PrismWorkspace;

const mutesPath = (): string => join(root, ".prism", "finding-mutes.json");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "prism-mutes-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}\n', "utf8");
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error("failed to open workspace");
  ws = opened.value;
});

afterEach(async () => {
  ws.close();
  await rm(root, { recursive: true, force: true });
});

describe("finding mutes (M-074 B1)", () => {
  it("starts empty when no file exists", async () => {
    const listed = await ws.listMutedFindings();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([]);
  });

  it("mutes and unmutes a fingerprint, persisting to .prism/finding-mutes.json", async () => {
    const muted = await ws.muteFinding("abc123");
    expect(muted.ok).toBe(true);
    if (!muted.ok) return;
    expect(muted.value).toEqual(["abc123"]);

    const onDisk = JSON.parse(await readFile(mutesPath(), "utf8")) as {
      mutes: { fingerprint: string }[];
    };
    expect(onDisk.mutes).toHaveLength(1);
    expect(onDisk.mutes[0]?.fingerprint).toBe("abc123");

    const listed = await ws.listMutedFindings();
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toEqual(["abc123"]);

    const unmuted = await ws.unmuteFinding("abc123");
    expect(unmuted.ok).toBe(true);
    if (unmuted.ok) expect(unmuted.value).toEqual([]);
  });

  it("is idempotent: muting the same fingerprint twice does not duplicate it", async () => {
    await ws.muteFinding("dup1");
    const second = await ws.muteFinding("dup1");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toEqual(["dup1"]);
  });

  it("unmuting something never muted is a no-op, not an error", async () => {
    const result = await ws.unmuteFinding("never-muted");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("rejects a corrupt mute file instead of silently discarding it", async () => {
    await mkdir(join(root, ".prism"), { recursive: true });
    await writeFile(mutesPath(), "not json", "utf8");
    const result = await ws.listMutedFindings();
    expect(result.ok).toBe(false);
  });
});
