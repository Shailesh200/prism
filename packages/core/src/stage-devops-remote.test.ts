import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stageDevopsRemote } from "./stage-devops-remote.js";

/**
 * ADR-0024: no Core path reaches the network without explicit consent.
 * These tests assert the refusal happens *before* any fetch, so a surface
 * that forgets its own toggle cannot leak a request (M-051 Phase 4).
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

  it("refuses without consent and issues no request", async () => {
    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
      consentGranted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when consent is absent or not literally true", async () => {
    for (const consentGranted of [
      undefined,
      null,
      1,
      "true",
    ] as unknown as boolean[]) {
      const result = await stageDevopsRemote({
        workspaceRoot: root,
        owner: "octocat",
        repo: "hello-world",
        consentGranted,
      });
      expect(result.ok).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses before validating other inputs", async () => {
    // Blank owner/repo would also fail, but consent must be the reported
    // reason so the user learns the real blocker.
    const result = await stageDevopsRemote({
      workspaceRoot: "",
      owner: "",
      repo: "",
      consentGranted: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
  });

  it("proceeds to the network only once consent is granted", async () => {
    const result = await stageDevopsRemote({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
      consentGranted: true,
    });

    // The mocked fetch rejects, so this fails — but it failed at the network,
    // which is the proof that consent unlocked the path.
    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
