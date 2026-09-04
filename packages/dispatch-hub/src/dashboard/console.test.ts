import { describe, expect, it } from "vitest";
import {
  CONSOLE_VIEWS,
  parseJobId,
  parseRepoFilter,
  parseView,
  findingsHash,
} from "./router.js";
import { explainStatus } from "./session.js";
import { isStale, STALE_AFTER_MS, toJobSummary } from "./use-jobs.js";
import { repoLabel } from "./console-app.js";
import type { JobSnapshot } from "../types.js";

const base: JobSnapshot = {
  id: "job-1",
  title: "AI-971 fix the thing",
  status: "running",
  branch: "prism/ai-971",
  createdAt: "2026-09-02T10:00:00.000Z",
  updatedAt: "2026-09-02T10:05:00.000Z",
  workspacePath: "/repo",
  workspaceLabel: "repo",
};

describe("parseView", () => {
  it("maps every declared view to itself", () => {
    for (const view of CONSOLE_VIEWS) {
      expect(parseView(`#/${view}`)).toBe(view);
    }
  });

  it("falls back to jobs for an empty or unknown hash", () => {
    expect(parseView("")).toBe("jobs");
    expect(parseView("#")).toBe("jobs");
    expect(parseView("#/nonsense")).toBe("jobs");
  });

  it("redirects the retired Workflows and Repos hashes to Jobs", () => {
    expect(parseView("#/workflows")).toBe("jobs");
    expect(parseView("#/repos")).toBe("jobs");
  });

  it("ignores a query string after the view", () => {
    expect(parseView("#/intelligence?token=abc")).toBe("intelligence");
  });

  it("reads a repo filter from the jobs hash", () => {
    expect(parseRepoFilter("#/jobs?repo=%2FUsers%2Fme%2FPrism")).toBe(
      "/Users/me/Prism",
    );
    expect(parseRepoFilter("#/jobs")).toBeUndefined();
  });

  it("reads a findings job and note from the hash", () => {
    expect(parseView("#/findings")).toBe("findings");
    expect(
      parseJobId(
        "#/findings?job=audit-gsap&note=.prism%2Fdispatch%2Fnotes%2Fa.md",
      ),
    ).toBe("audit-gsap");
    expect(findingsHash()).toBe("#/findings");
    expect(
      findingsHash({
        job: "audit-gsap",
        note: ".prism/dispatch/notes/a.md",
      }),
    ).toBe("#/findings?job=audit-gsap&note=.prism%2Fdispatch%2Fnotes%2Fa.md");
  });
});

describe("toJobSummary", () => {
  it("passes the worker backend through", () => {
    const summary = toJobSummary({
      ...base,
      workerBackend: "claude",
      workerModel: "claude-haiku-4-5-20251001",
      workerThinking: "10000",
      notes: [".prism/dispatch/notes/a.md"],
      citedMissing: ["lib/gsap.ts"],
    });
    expect(summary.workerBackend).toBe("claude");
    expect(summary.workerModel).toBe("claude-haiku-4-5-20251001");
    expect(summary.workerThinking).toBe("10000");
    expect(summary.notes).toEqual([".prism/dispatch/notes/a.md"]);
    expect(summary.citedMissing).toEqual(["lib/gsap.ts"]);
  });

  it("omits absent timestamps rather than sending undefined", () => {
    const summary = toJobSummary(base);
    expect("startedAt" in summary).toBe(false);
    expect("finishedAt" in summary).toBe(false);
    expect(summary.createdAt).toBe(base.createdAt);
  });

  it("carries every timestamp the snapshot has", () => {
    const summary = toJobSummary({
      ...base,
      status: "done",
      queuedAt: "2026-09-02T10:00:01.000Z",
      startedAt: "2026-09-02T10:00:09.000Z",
      finishedAt: "2026-09-02T10:04:00.000Z",
    });
    expect(summary.queuedAt).toBe("2026-09-02T10:00:01.000Z");
    expect(summary.startedAt).toBe("2026-09-02T10:00:09.000Z");
    expect(summary.finishedAt).toBe("2026-09-02T10:04:00.000Z");
  });

  it("passes a confirm gate through with its dirty paths", () => {
    const summary = toJobSummary({
      ...base,
      status: "needs_confirm",
      confirm: {
        kind: "dirty_tree",
        question: "You have uncommitted work. Start anyway?",
        dirtyPaths: ["src/a.ts", "src/b.ts"],
      },
    });
    expect(summary.confirm?.kind).toBe("dirty_tree");
    expect(summary.confirm?.dirtyPaths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("drops an empty dirty path list instead of rendering an empty section", () => {
    const summary = toJobSummary({
      ...base,
      status: "needs_confirm",
      confirm: {
        kind: "overlap",
        question: "Another job touches this.",
        dirtyPaths: [],
      },
    });
    expect(summary.confirm && "dirtyPaths" in summary.confirm).toBe(false);
  });
});

describe("isStale", () => {
  it("is not stale before the first read — that is loading, not stale", () => {
    expect(isStale(undefined, 10_000)).toBe(false);
  });

  it("is not stale while reads keep landing", () => {
    expect(isStale(10_000, 10_000 + STALE_AFTER_MS - 1)).toBe(false);
  });

  it("becomes stale once reads stop", () => {
    expect(isStale(10_000, 10_000 + STALE_AFTER_MS + 1)).toBe(true);
  });
});

describe("repoLabel", () => {
  it("says it is still reading rather than counting to zero", () => {
    expect(repoLabel({ loading: true, jobs: [], errors: [] })).toBe(
      "Reading your repositories…",
    );
  });

  it("counts jobs once a read has landed", () => {
    expect(repoLabel({ loading: false, jobs: [base], errors: [] })).toBe(
      "1 job across your repositories",
    );
    expect(repoLabel({ loading: false, jobs: [], errors: [] })).toBe(
      "0 jobs across your repositories",
    );
  });

  it("surfaces unreadable repositories instead of hiding them", () => {
    expect(repoLabel({ loading: false, jobs: [base], errors: [{}, {}] })).toBe(
      "1 job · 2 repos unreadable",
    );
  });

  // An expired token fails every read, so `loading` never clears. Promising to
  // read repositories forever is worse than admitting the read failed.
  it("admits a failed read rather than claiming to still be loading", () => {
    expect(
      repoLabel({
        loading: true,
        jobs: [],
        errors: [],
        fatal: "Your Console token expired. Ask Prism for a fresh token.",
      }),
    ).toBe("Could not read your repositories");
  });
});

describe("explainStatus", () => {
  it("tells an expired token apart from a server fault", () => {
    expect(explainStatus(401)).toMatch(/fresh token/);
    expect(explainStatus(500)).toMatch(/HTTP 500/);
  });
});
