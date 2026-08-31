import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { upsertJob, type JobRecord } from "@repo-prism/dispatch";
import { registerWorkspace } from "./registry.js";
import {
  buildStatusline,
  formatStatusline,
  parseStatuslineStdin,
  statuslineSetupSnippet,
} from "./statusline.js";

let home: string | undefined;
let repo: string | undefined;

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
  if (repo) await rm(repo, { recursive: true, force: true });
  home = undefined;
  repo = undefined;
});

function job(patch: Partial<JobRecord>): JobRecord {
  const now = new Date().toISOString();
  return {
    id: "j1",
    title: "fix login",
    playbook: "ticket",
    prd: "",
    branch: "main",
    worktreePath: "/tmp/x",
    source: "checkout",
    status: "running",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe("parseStatuslineStdin", () => {
  it("reads the current dir from Claude Code's payload", () => {
    expect(
      parseStatuslineStdin(
        JSON.stringify({ workspace: { current_dir: "/repo/a" } }),
      ),
    ).toEqual({ cwd: "/repo/a" });
    expect(parseStatuslineStdin(JSON.stringify({ cwd: "/repo/b" }))).toEqual({
      cwd: "/repo/b",
    });
    expect(parseStatuslineStdin("not json")).toEqual({ cwd: "" });
    expect(parseStatuslineStdin("")).toEqual({ cwd: "" });
  });
});

describe("formatStatusline", () => {
  it("is quiet when nothing is happening", () => {
    expect(formatStatusline([], [])).toBe("");
    expect(formatStatusline([job({ status: "done" })], [])).toBe("");
  });

  it("shows the freshest live job with its activity", () => {
    const line = formatStatusline(
      [
        job({ title: "fix login", lastActivity: "Editing files" }),
        job({ id: "j2", title: "audit", status: "booting" }),
      ],
      [],
    );
    expect(line).toContain("fix login");
    expect(line).toContain("Editing files");
    expect(line).toContain("+1 running");
  });

  it("shows review-ready and failed jobs", () => {
    const line = formatStatusline(
      [
        job({ status: "needs_review", title: "fix login" }),
        job({ id: "j2", status: "error", title: "audit" }),
      ],
      [],
    );
    expect(line).toContain("✓ fix login ready for review");
    expect(line).toContain("✗ audit stopped");
  });

  it("folds other repos into a count", () => {
    const line = formatStatusline(
      [job({ title: "here" })],
      [job({ id: "x", title: "elsewhere" })],
    );
    expect(line).toContain("here");
    expect(line).toContain("1 in other repos");
    expect(line).not.toContain("elsewhere");
  });

  it("never prints a worktree path", () => {
    const line = formatStatusline(
      [job({ title: "fix login", worktreePath: "/secret/worktree/path" })],
      [],
    );
    expect(line).not.toContain("/secret");
  });
});

describe("buildStatusline", () => {
  it("puts the repo you are sitting in first", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    const other = await mkdtemp(join(tmpdir(), "prism-hub-other-"));
    try {
      await registerWorkspace(repo, { PRISM_HUB_HOME: home });
      await registerWorkspace(other, { PRISM_HUB_HOME: home });
      await upsertJob(repo, job({ id: "here-job", title: "here job" }));
      await upsertJob(other, job({ id: "there-job", title: "there job" }));

      const line = await buildStatusline(
        JSON.stringify({ workspace: { current_dir: repo } }),
        { PRISM_HUB_HOME: home },
      );
      expect(line).toContain("here job");
      expect(line).toContain("1 in other repos");
      expect(line).not.toContain("there job");
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("is empty when no workspace has jobs", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const line = await buildStatusline("{}", { PRISM_HUB_HOME: home });
    expect(line).toBe("");
  });
});

describe("statuslineSetupSnippet", () => {
  it("is a mergeable settings.json block", () => {
    const snippet = JSON.parse(statuslineSetupSnippet()) as {
      statusLine: { type: string; command: string; refreshInterval: number };
    };
    expect(snippet.statusLine.type).toBe("command");
    expect(snippet.statusLine.command).toContain("statusline");
    expect(snippet.statusLine.refreshInterval).toBeGreaterThanOrEqual(1);
  });
});
