import { describe, expect, it } from "vitest";
import {
  CONSOLE_VIEWS,
  parseJobId,
  parseRepoFilter,
  parseView,
  findingsHash,
  jobsHash,
  viewHash,
} from "./router.js";
import {
  ConsoleRequestError,
  explainStatus,
  apiErrorMessage,
  consoleJobShareUrl,
  getJson,
  postJson,
} from "./session.js";
import { controlFinishToast } from "./console-toast.js";
import { isStale, STALE_AFTER_MS, toJobSummary } from "./use-jobs.js";
import { repoLabel } from "./fleet.js";
import type { JobSnapshot } from "../types.js";

const base: JobSnapshot = {
  id: "job-1",
  title: "AI-971 fix the thing",
  status: "running",
  branch: "prism/ai-971",
  lastActivity: "Editing files",
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

  it("falls back to dashboard for an empty or unknown hash", () => {
    expect(parseView("")).toBe("dashboard");
    expect(parseView("#")).toBe("dashboard");
    expect(parseView("#/nonsense")).toBe("dashboard");
  });

  it("redirects retired hashes to the new IA", () => {
    expect(parseView("#/jobs")).toBe("dashboard");
    expect(parseView("#/repos")).toBe("dashboard");
    expect(parseView("#/workflows")).toBe("attention");
    expect(parseView("#/intelligence")).toBe("iris");
    expect(parseView("#/whats-new")).toBe("whats-new");
    expect(viewHash("whats-new")).toBe("#/whats-new");
  });

  it("ignores a query string after the view", () => {
    expect(parseView("#/intelligence?token=abc")).toBe("iris");
    expect(parseView("#/iris?load=1")).toBe("iris");
  });

  it("reads a repo filter from the jobs hash", () => {
    expect(parseRepoFilter("#/jobs?repo=%2FUsers%2Fme%2FPrism")).toBe(
      "/Users/me/Prism",
    );
    expect(parseRepoFilter("#/jobs")).toBeUndefined();
    expect(parseJobId("#/jobs?job=attention-cards")).toBe("attention-cards");
  });

  it("builds a dashboard hash that keeps an optional repo filter", () => {
    expect(jobsHash()).toBe("#/dashboard");
    expect(jobsHash("/Users/me/Prism")).toBe(
      "#/dashboard?repo=%2FUsers%2Fme%2FPrism",
    );
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
        kind: "dirty-checkout",
        arg: "confirmDirty",
        question: "You have uncommitted work. Start anyway?",
        dirtyPaths: ["src/a.ts", "src/b.ts"],
      },
    });
    expect(summary.confirm?.kind).toBe("dirty-checkout");
    expect(summary.confirm?.dirtyPaths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("drops an empty dirty path list instead of rendering an empty section", () => {
    const summary = toJobSummary({
      ...base,
      status: "needs_confirm",
      confirm: {
        kind: "path-overlap",
        arg: "confirmOverlap",
        question: "Another job touches this.",
        dirtyPaths: [],
      },
    });
    expect(summary.confirm && "dirtyPaths" in summary.confirm).toBe(false);
  });

  it("carries the prompt onto the summary", () => {
    const summary = toJobSummary({
      ...base,
      prd: "Make the news tab highlight.",
    });
    expect(summary.prd).toBe("Make the news tab highlight.");
  });

  it("passes token usage through", () => {
    const summary = toJobSummary({
      ...base,
      tokenUsage: {
        inputTokens: 1_200,
        outputTokens: 80,
        contextTokens: 48_000,
        contextWindow: 200_000,
      },
    });
    expect(summary.tokenUsage?.inputTokens).toBe(1_200);
    expect(summary.tokenUsage?.outputTokens).toBe(80);
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

describe("consoleJobShareUrl", () => {
  it("keeps the token and hashes Focus to the job", () => {
    expect(
      consoleJobShareUrl(
        { id: "attention-cards", workspacePath: "/Users/me/Prism" },
        "abc-token",
        "http://prismhq.localhost:17330/?token=old#/jobs",
      ),
    ).toBe(
      "http://prismhq.localhost:17330/?token=abc-token#/dashboard?repo=%2FUsers%2Fme%2FPrism&job=attention-cards",
    );
  });

  it("re-attaches a stored token when the query was stripped", () => {
    expect(
      consoleJobShareUrl(
        { id: "job-1" },
        "fresh",
        "http://127.0.0.1:17330/#/jobs",
      ),
    ).toBe("http://127.0.0.1:17330/?token=fresh#/dashboard?job=job-1");
  });
});

describe("explainStatus", () => {
  it("tells an expired token apart from a server fault", () => {
    expect(explainStatus(401)).toMatch(/fresh token/);
    expect(explainStatus(500)).toMatch(/HTTP 500/);
  });
});

describe("apiErrorMessage", () => {
  it("prefers the server's error text over a generic HTTP label", () => {
    expect(
      apiErrorMessage({ error: "No worker configured." }, "HTTP 500"),
    ).toBe("No worker configured.");
    expect(
      apiErrorMessage(
        { message: "Could not retry Fix map: spawn failed" },
        "fallback",
      ),
    ).toBe("Could not retry Fix map: spawn failed");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(apiErrorMessage({ error: "unauthorized" }, "fresh token")).toBe(
      "fresh token",
    );
  });
});

describe("getJson / postJson", () => {
  it("returns JSON on 200 and formats a 401", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fail")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(getJson("/api/jobs", "tok")).resolves.toEqual({ jobs: [] });
      await expect(getJson("/api/fail", "tok")).rejects.toMatchObject({
        name: "ConsoleRequestError",
        status: 401,
        message: expect.stringMatching(/fresh token/),
      });
      await expect(
        postJson("/api/jobs", "tok", { title: "x" }),
      ).resolves.toEqual({ jobs: [] });
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("names a dead hub instead of a generic fetch failure", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      await expect(getJson("/api/jobs", "tok")).rejects.toBeInstanceOf(
        ConsoleRequestError,
      );
      await expect(getJson("/api/jobs", "tok")).rejects.toMatchObject({
        status: 0,
        message: expect.stringMatching(/Could not reach Prism Dispatch/),
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("controlFinishToast", () => {
  it("names a retry by title", () => {
    expect(controlFinishToast("retry", { title: "Fix the map" })).toEqual({
      message: "Retrying Fix the map",
      tone: "ok",
    });
  });

  it("toasts verification outcome", () => {
    expect(controlFinishToast("reverify", { verification: "passed" })).toEqual({
      message: "Verification passed",
      tone: "ok",
    });
    expect(controlFinishToast("reverify", { verification: "failed" })).toEqual({
      message: "Verification failed",
      tone: "error",
    });
    expect(controlFinishToast("reverify")).toEqual({
      message: "Verification finished",
      tone: "ok",
    });
  });
});
