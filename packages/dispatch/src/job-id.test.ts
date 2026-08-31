import { describe, expect, it } from "vitest";
import {
  allocateJobId,
  displayJobId,
  isOpaqueJobId,
  resolveJobRef,
  slugFromTitle,
} from "./job-id.js";
import {
  agentNameForJob,
  initSpeak,
  isNetworkFailureMessage,
  jobRef,
  listJobsSpeak,
  publicRunFailure,
  publicWorkerError,
  startJobSpeak,
} from "./job-voice.js";

describe("canonical job ids", () => {
  it("uses a ticket token when the title has one", () => {
    expect(slugFromTitle("AI-971 login")).toBe("AI-971");
    expect(allocateJobId({ title: "AI-971 login", taken: new Set() })).toBe(
      "AI-971",
    );
  });

  it("slugs a freeform title instead of job-hex", () => {
    expect(slugFromTitle("Audit issues in this repo")).toBe(
      "audit-issues-in-this-repo",
    );
    expect(
      allocateJobId({ title: "Audit issues in this repo", taken: new Set() }),
    ).toBe("audit-issues-in-this-repo");
    expect(
      allocateJobId({
        title: "Audit issues in this repo",
        taken: new Set(["audit-issues-in-this-repo"]),
      }),
    ).toBe("audit-issues-in-this-repo-2");
  });

  it("hides legacy job-hex ids behind a title slug", () => {
    expect(isOpaqueJobId("job-2405972d")).toBe(true);
    expect(
      displayJobId({ id: "job-2405972d", title: "Audit issues in this repo" }),
    ).toBe("audit-issues-in-this-repo");
    expect(
      jobRef({ id: "job-2405972d", title: "Audit issues in this repo" }),
    ).toBe("Audit issues in this repo (audit-issues-in-this-repo)");
  });

  it("resolves pause/cancel by slug or title", () => {
    const jobs = [
      { id: "job-2405972d", title: "Audit issues in this repo" },
      { id: "AI-971", title: "AI-971 login" },
    ];
    expect(resolveJobRef(jobs, "audit-issues-in-this-repo")?.kind).toBe("one");
    expect(resolveJobRef(jobs, "AI-971")?.kind).toBe("one");
    expect(resolveJobRef(jobs, "login")?.kind).toBe("one");
  });
});

describe("job voice", () => {
  it("starts a job without hex ids, paths, or API keys", () => {
    const text = startJobSpeak({
      id: "audit-issues",
      title: "Audit issues in this repo",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/audit-issues",
      worktreePath: "/tmp/hidden",
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "t",
      updatedAt: "t",
    });
    expect(text).toContain("Audit issues in this repo");
    expect(text).toContain("audit-issues");
    expect(text).toMatch(/where are we/i);
    expect(text).not.toMatch(/job-[0-9a-f]{8}/i);
    expect(text).not.toContain("/tmp/hidden");
    expect(text).not.toMatch(/API key|mcp\.json/i);
  });

  it("names the Cursor agent after the job title", () => {
    expect(agentNameForJob({ id: "audit-issues", title: "Audit issues" })).toBe(
      "Prism · Audit issues",
    );
  });

  it("lists jobs without worktree paths", () => {
    const text = listJobsSpeak([
      {
        id: "job-2405972d",
        title: "Audit issues in this repo",
        status: "running",
        agentStatus: "unknown",
        gitStatus: " M a.ts\n",
      },
    ]);
    expect(text).toContain("Audit issues in this repo");
    expect(text).toMatch(/teammate stopped/i);
    expect(text).not.toMatch(/job-2405972d/);
  });

  it("lists a finished result without worktree paths", () => {
    const text = listJobsSpeak([
      {
        id: "audit-issues",
        title: "Audit issues",
        status: "done",
        agentStatus: "done",
        gitStatus: "clean",
        resultSummary: "3 files changed. Slimmed the lighthouse runner.",
      },
    ]);
    expect(text).toMatch(/finished/i);
    expect(text).toMatch(/lighthouse/);
    expect(text).not.toMatch(/worktree|job-2405972d/i);
  });

  it("never mentions API keys in init or worker errors", () => {
    expect(initSpeak(true, "dev@prism.test")).toMatch(/You're set as/);
    expect(initSpeak(true, "dev@prism.test")).not.toMatch(/API key|mcp\.json/i);
    expect(publicWorkerError("@cursor/sdk is not installed")).not.toMatch(
      /@cursor\/sdk|API key/i,
    );
    expect(publicRunFailure("run failed crsr_abc123")).toMatch(/hit an error/i);
    expect(publicRunFailure("run failed crsr_abc123")).not.toMatch(/crsr_/i);
  });

  it("explains a failed Cursor request instead of echoing the SDK string", () => {
    const text = publicWorkerError("Network request failed");
    expect(text).toMatch(/could not reach Cursor/i);
    expect(text).toMatch(/VPN|proxy|offline/i);
    expect(text).toMatch(/resume|in this chat/i);
    expect(text).not.toMatch(/Network request failed/);
  });

  it("treats TLS interception and DNS errors as the same network story", () => {
    for (const detail of [
      "fetch failed",
      "unable to get local issuer certificate",
      "self-signed certificate in certificate chain",
      "getaddrinfo ENOTFOUND api.cursor.com",
      "connect ETIMEDOUT 1.2.3.4:443",
    ]) {
      expect(isNetworkFailureMessage(detail), detail).toBe(true);
      expect(publicWorkerError(detail), detail).toMatch(
        /could not reach Cursor/i,
      );
    }
  });

  it("does not call an ordinary failure a network problem", () => {
    expect(isNetworkFailureMessage("@cursor/sdk is not installed")).toBe(false);
    expect(isNetworkFailureMessage("the run failed")).toBe(false);
  });

  it("points a mid-run connection loss at resume", () => {
    const text = publicRunFailure("Network request failed");
    expect(text).toMatch(/lost its connection/i);
    expect(text).toMatch(/resume/i);
  });
});
