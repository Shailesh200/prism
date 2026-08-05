import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PrismWorkspace } from "@prism/core";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { createWorkspaceSession } from "./session.js";

/** Minimal stand-in — the session only ever calls `index` and `close`. */
function fakeWorkspace(index: () => Promise<Result<unknown, PrismError>>): {
  workspace: PrismWorkspace;
  close: ReturnType<typeof vi.fn>;
} {
  const close = vi.fn();
  const workspace = { index, close } as unknown as PrismWorkspace;
  return { workspace, close };
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-mcp-session-"));
}

describe("workspace session (M-026)", () => {
  it("indexes once however many tools are called", async () => {
    const root = await tempDir();
    const index = vi.fn(async () => ok({ files: [] }));
    const { workspace } = fakeWorkspace(index);
    const session = createWorkspaceSession({
      root,
      openWorkspace: () => ok(workspace),
    });

    await session.ready();
    await session.ready();
    await session.ready();

    expect(index).toHaveBeenCalledTimes(1);
  });

  it("indexes once when the first calls arrive concurrently", async () => {
    // An agent firing several tools at once must not start several indexes.
    const root = await tempDir();
    const index = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return ok({ files: [] });
    });
    const { workspace } = fakeWorkspace(index);
    const session = createWorkspaceSession({
      root,
      openWorkspace: () => ok(workspace),
    });

    const results = await Promise.all([
      session.ready(),
      session.ready(),
      session.ready(),
    ]);

    expect(index).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("opens nothing until the first tool call", async () => {
    const root = await tempDir();
    const open = vi.fn(() => ok(fakeWorkspace(async () => ok({})).workspace));
    const session = createWorkspaceSession({ root, openWorkspace: open });

    expect(open).not.toHaveBeenCalled();
    expect(session.isOpen()).toBe(false);

    await session.ready();
    expect(open).toHaveBeenCalledTimes(1);
    expect(session.isOpen()).toBe(true);
  });

  it("reports a missing directory as an invalid path, not a crash", async () => {
    const session = createWorkspaceSession({
      root: join(tmpdir(), "prism-mcp-does-not-exist-9d3f"),
      openWorkspace: () => ok(fakeWorkspace(async () => ok({})).workspace),
    });

    const ready = await session.ready();
    expect(ready.ok).toBe(false);
    if (ready.ok) return;
    expect(ready.error.code).toBe(PrismErrorCode.INVALID_PATH);
    expect(ready.error.message).toContain("not readable");
  });

  it("rejects a file where a directory was expected", async () => {
    const root = await tempDir();
    const file = join(root, "not-a-dir.txt");
    await writeFile(file, "x");

    const session = createWorkspaceSession({
      root: file,
      openWorkspace: () => ok(fakeWorkspace(async () => ok({})).workspace),
    });

    const ready = await session.ready();
    expect(ready.ok).toBe(false);
    if (ready.ok) return;
    expect(ready.error.code).toBe(PrismErrorCode.INVALID_PATH);
    expect(ready.error.message).toContain("not a directory");
  });

  it("closes the workspace when indexing fails, so no SQLite handle leaks", async () => {
    const root = await tempDir();
    const { workspace, close } = fakeWorkspace(async () =>
      err(prismError(PrismErrorCode.INDEX_FAILED, "boom")),
    );
    const session = createWorkspaceSession({
      root,
      openWorkspace: () => ok(workspace),
    });

    const ready = await session.ready();
    expect(ready.ok).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed open instead of poisoning the process", async () => {
    // The server is long-lived. One transient failure must not make every
    // later tool call fail for the rest of the session.
    const root = await tempDir();
    let attempt = 0;
    const session = createWorkspaceSession({
      root,
      openWorkspace: () => {
        attempt += 1;
        if (attempt === 1) {
          return err(prismError(PrismErrorCode.IO_ERROR, "transient"));
        }
        return ok(fakeWorkspace(async () => ok({})).workspace);
      },
    });

    expect((await session.ready()).ok).toBe(false);
    expect((await session.ready()).ok).toBe(true);
    expect(attempt).toBe(2);
  });

  it("releases the workspace on close", async () => {
    const root = await tempDir();
    const { workspace, close } = fakeWorkspace(async () => ok({}));
    const session = createWorkspaceSession({
      root,
      openWorkspace: () => ok(workspace),
    });

    await session.ready();
    session.close();

    expect(close).toHaveBeenCalledTimes(1);
    expect(session.isOpen()).toBe(false);
  });
});
