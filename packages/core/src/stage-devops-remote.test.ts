import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsentStore } from "@prism/intelligence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stageDevopsRemote } from "./stage-devops-remote.js";

/**
 * ADR-0024: no Core path reaches the network without explicit consent.
 * These tests assert the refusal happens *before* any fetch, so a surface
 * that forgets its own toggle cannot leak a request (M-051 Phase 4).
 *
 * M-036 moved the decision itself into `.prism/consent.json`. The gate used to
 * read a `consentGranted` boolean off the input, which meant the caller was
 * the authority — and every caller said yes.
 */
function spyOnFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("network call escaped the consent gate"));
}

describe("stageDevopsRemote consent gate", () => {
  let root: string;
  let fetchSpy: ReturnType<typeof spyOnFetch>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "prism-stage-devops-"));
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("refuses on a fresh workspace and issues no request", async () => {
    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
    // The refusal names what would have happened, not just that it refused.
    expect(result.error).toMatch(/api\.github\.com|GitHub/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the purpose was explicitly denied", async () => {
    await createConsentStore({ workspaceRoot: root }).set(
      "network.github",
      false,
    );

    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is not unlocked by a grant for some other purpose", async () => {
    // A single master toggle was the old design's mistake: agreeing to run a
    // local build is not agreeing to talk to GitHub.
    const store = createConsentStore({ workspaceRoot: root });
    await store.set("run.local-build", true);
    await store.set("network.pagespeed", true);

    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses before validating other inputs", async () => {
    // Blank owner/repo would also fail, but consent must be the reported
    // reason so the user learns the real blocker.
    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "",
      repo: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
  });

  it("proceeds to the network only once consent is granted", async () => {
    await createConsentStore({ workspaceRoot: root }).set(
      "network.github",
      true,
    );

    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });

    // The mocked fetch rejects, so this fails — but it failed at the network,
    // which is the proof that consent unlocked the path.
    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
