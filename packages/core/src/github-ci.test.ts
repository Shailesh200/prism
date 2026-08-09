import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsentStore } from "@repo-prism/intelligence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchGithubWorkflow, fetchGithubWorkflows } from "./github-ci.js";
import { fetchPagespeedMetrics } from "./pagespeed.js";

/**
 * ADR-0033 / ADR-0024: GitHub CI + PageSpeed refuse before any fetch when
 * consent is missing. Tokens must never be required to exercise the gate.
 */
function spyOnFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("network call escaped the consent gate"));
}

describe("github-ci consent gate", () => {
  let root: string;
  let fetchSpy: ReturnType<typeof spyOnFetch>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "prism-github-ci-"));
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("refuses list workflows without network.github", async () => {
    const result = await fetchGithubWorkflows({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses dispatch without network.github", async () => {
    const result = await dispatchGithubWorkflow({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
      kind: "workflow_dispatch",
      workflowPath: ".github/workflows/ci.yml",
    });
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proceeds only after network.github is granted", async () => {
    await createConsentStore({ workspaceRoot: root }).set(
      "network.github",
      true,
    );
    const result = await fetchGithubWorkflows({
      workspaceRoot: root,
      owner: "octocat",
      repo: "hello-world",
    });
    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe("pagespeed consent gate", () => {
  let root: string;
  let fetchSpy: ReturnType<typeof spyOnFetch>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "prism-pagespeed-"));
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("refuses without network.pagespeed", async () => {
    const result = await fetchPagespeedMetrics({
      workspaceRoot: root,
      apiKey: "AIzaSyDummyKeyForGateTestOnly",
      url: "https://example.com",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consent/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is not unlocked by network.github alone", async () => {
    await createConsentStore({ workspaceRoot: root }).set(
      "network.github",
      true,
    );
    const result = await fetchPagespeedMetrics({
      workspaceRoot: root,
      apiKey: "AIzaSyDummyKeyForGateTestOnly",
      url: "https://example.com",
    });
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proceeds only after network.pagespeed is granted", async () => {
    await createConsentStore({ workspaceRoot: root }).set(
      "network.pagespeed",
      true,
    );
    const result = await fetchPagespeedMetrics({
      workspaceRoot: root,
      apiKey: "AIzaSyDummyKeyForGateTestOnly",
      url: "https://example.com",
    });
    expect(result.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
