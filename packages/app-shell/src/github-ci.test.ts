/**
 * Re-export characterisation: pure helpers live in intelligence (M-053 T-11).
 * Kept here so app-shell package test entry still covers the public re-exports.
 */

import { describe, expect, it } from "vitest";
import {
  matchRemoteWorkflowId,
  parseGithubRepoRef,
  type GithubWorkflowSummary,
} from "./github-ci.js";

describe("parseGithubRepoRef", () => {
  it("accepts owner/repo and strips .git", () => {
    expect(parseGithubRepoRef("Shailesh200/prism")).toEqual({
      owner: "Shailesh200",
      repo: "prism",
    });
    expect(parseGithubRepoRef("Shailesh200/prism.git")).toEqual({
      owner: "Shailesh200",
      repo: "prism",
    });
  });

  it("accepts github.com URLs with or without scheme", () => {
    expect(parseGithubRepoRef("https://github.com/a/b")).toEqual({
      owner: "a",
      repo: "b",
    });
    expect(parseGithubRepoRef("github.com/a/b.git")).toEqual({
      owner: "a",
      repo: "b",
    });
  });

  it("returns null for empty or non-GitHub input", () => {
    expect(parseGithubRepoRef("")).toBeNull();
    expect(parseGithubRepoRef("   ")).toBeNull();
    expect(parseGithubRepoRef("https://gitlab.com/a/b")).toBeNull();
    expect(parseGithubRepoRef("not-a-repo")).toBeNull();
  });
});

describe("matchRemoteWorkflowId", () => {
  const remotes: GithubWorkflowSummary[] = [
    {
      id: 11,
      name: "CI",
      path: ".github/workflows/ci.yml",
      state: "active",
      htmlUrl: "https://github.com/a/b/actions/workflows/ci.yml",
    },
    {
      id: 22,
      name: "Release",
      path: ".github/workflows/release.yml",
      state: "active",
      htmlUrl: "https://github.com/a/b/actions/workflows/release.yml",
    },
  ];

  it("matches by full path, trailing path, or basename", () => {
    expect(matchRemoteWorkflowId(".github/workflows/ci.yml", remotes)).toBe(11);
    expect(matchRemoteWorkflowId("/.github/workflows/ci.yml", remotes)).toBe(
      11,
    );
    expect(matchRemoteWorkflowId("ci.yml", remotes)).toBe(11);
    expect(matchRemoteWorkflowId("release.yml", remotes)).toBe(22);
  });

  it("returns undefined when nothing matches", () => {
    expect(matchRemoteWorkflowId("missing.yml", remotes)).toBeUndefined();
  });
});
