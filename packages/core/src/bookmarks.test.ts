import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

let root: string;
let ws: PrismWorkspace;

const bookmarksPath = (): string => join(root, ".prism", "bookmarks.json");

async function writeBookmarksFile(contents: string): Promise<void> {
  await mkdir(join(root, ".prism"), { recursive: true });
  await writeFile(bookmarksPath(), contents, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "prism-bookmarks-"));
  await writeFile(join(root, "package.json"), '{"name":"fixture"}\n', "utf8");
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error("failed to open workspace");
  ws = opened.value;
});

afterEach(async () => {
  ws.close();
  await rm(root, { recursive: true, force: true });
});

describe("bookmark store (M-048 Phase 6, hardened in M-051)", () => {
  it("starts empty when no file exists", async () => {
    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([]);
  });

  it("saves, lists and removes a bookmark", async () => {
    const saved = await ws.saveBookmark({ label: "Entry point", path: "a.ts" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value).toHaveLength(1);
    expect(saved.value[0]?.label).toBe("Entry point");

    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);

    const id = saved.value[0]?.id ?? "";
    const removed = await ws.removeBookmark(id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value).toEqual([]);
  });

  it("upserts by id rather than duplicating", async () => {
    const first = await ws.saveBookmark({ label: "Original", path: "a.ts" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const id = first.value[0]?.id ?? "";

    const second = await ws.saveBookmark({
      id,
      label: "Renamed",
      path: "a.ts",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toHaveLength(1);
    expect(second.value[0]?.label).toBe("Renamed");
  });

  it("removing an unknown id leaves the store intact", async () => {
    await ws.saveBookmark({ label: "Keep me", path: "a.ts" });
    const removed = await ws.removeBookmark("bookmark:does-not-exist");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value).toHaveLength(1);
  });

  it("persists across workspace instances", async () => {
    await ws.saveBookmark({ label: "Persisted", path: "a.ts" });

    const reopened = Prism.create().openRepository(root);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    const listed = await reopened.value.listBookmarks();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value[0]?.label).toBe("Persisted");
    reopened.value.close();
  });

  // Corruption used to read as an empty store, so the next save overwrote the
  // file and the user's bookmarks were gone with no error shown.
  it("reports invalid JSON instead of reading as empty", async () => {
    await writeBookmarksFile("{ not json at all");

    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.code).toBe(PrismErrorCode.VALIDATION);
    expect(listed.error.message).toContain("valid JSON");
  });

  it("reports a structurally invalid store instead of reading as empty", async () => {
    await writeBookmarksFile('{"version":1,"bookmarks":"nope"}');

    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.code).toBe(PrismErrorCode.VALIDATION);
  });

  it("refuses to overwrite a corrupt store on save", async () => {
    await writeBookmarksFile("{ corrupt");

    const saved = await ws.saveBookmark({ label: "New", path: "a.ts" });
    expect(saved.ok).toBe(false);

    // The original bytes must survive so the user can recover them.
    const onDisk = await readFile(bookmarksPath(), "utf8");
    expect(onDisk).toBe("{ corrupt");
  });

  it("refuses to overwrite a corrupt store on remove", async () => {
    await writeBookmarksFile("{ corrupt");

    const removed = await ws.removeBookmark("bookmark:anything");
    expect(removed.ok).toBe(false);

    const onDisk = await readFile(bookmarksPath(), "utf8");
    expect(onDisk).toBe("{ corrupt");
  });

  it("recovers once the corrupt file is replaced", async () => {
    await writeBookmarksFile("{ corrupt");
    expect((await ws.listBookmarks()).ok).toBe(false);

    await writeBookmarksFile('{"version":1,"bookmarks":[]}');
    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([]);
  });

  it("fails cleanly once the workspace is closed", async () => {
    ws.close();
    const listed = await ws.listBookmarks();
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.code).toBe(PrismErrorCode.WORKSPACE_NOT_OPEN);
  });
});
