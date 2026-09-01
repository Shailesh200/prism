import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "./config.js";
import { createDispatchRuntime } from "./runtime.js";
import { DispatchModeSchema } from "./types.js";
import type { GitRunner } from "./git.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prism-dispatch-mode-"));
  roots.push(root);
  return root;
}

const git: GitRunner = async () => ({ ok: true, stdout: "", stderr: "" });

describe("dispatchMode", () => {
  it("defaults to asking rather than guessing", async () => {
    // An MCP server cannot intercept a host agent's edits, so guessing wrong
    // silently produced unwanted inline edits. Asking is the safe default.
    const root = await tempRoot();
    expect((await loadConfig(root)).dispatchMode).toBe("ask");
  });

  it("accepts only the three modes", () => {
    expect(DispatchModeSchema.options).toEqual(["ask", "auto", "inline"]);
    expect(DispatchModeSchema.safeParse("sometimes").success).toBe(false);
  });

  it("round-trips through configure and is reported back", async () => {
    const root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: {},
    });

    const set = (await runtime.handle("configure", {
      action: "set",
      patch: { dispatchMode: "auto" },
    })) as { message: string };
    expect(set.message).toContain("dispatchMode=auto");
    expect((await loadConfig(root)).dispatchMode).toBe("auto");

    const read = (await runtime.handle("configure", { action: "get" })) as {
      config: { dispatchMode: string };
      message: string;
    };
    expect(read.config.dispatchMode).toBe("auto");
    expect(read.message).toContain("dispatchMode=auto");
  });

  it("keeps an unrelated setting intact when only the mode changes", async () => {
    const root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: {},
    });
    await runtime.handle("configure", {
      action: "set",
      patch: { dispatchMode: "inline" },
    });
    const config = await loadConfig(root);
    expect(config.dispatchMode).toBe("inline");
    expect(config.placement).toBe("worktree");
  });

  it("does not reset other settings when one key is patched", async () => {
    // saveConfig used to spread undefined keys over stored values, so the
    // schema refilled its defaults and a one-key change wiped everything else.
    const root = await tempRoot();
    await saveConfig(root, {
      placement: "worktree",
      maxJobs: 7,
      ticketHost: "jira",
    });
    await saveConfig(root, { dispatchMode: "inline" });
    const config = await loadConfig(root);
    expect(config.dispatchMode).toBe("inline");
    expect(config.placement).toBe("worktree");
    expect(config.maxJobs).toBe(7);
    expect(config.ticketHost).toBe("jira");
  });

  it("rejects a bad mode without corrupting the stored config", async () => {
    const root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: {},
    });
    const result = (await runtime.handle("configure", {
      action: "set",
      patch: { dispatchMode: "whenever" },
    })) as { message: string };
    expect(result.message).toMatch(/invalid configure patch/i);
    expect((await loadConfig(root)).dispatchMode).toBe("ask");
  });
});
