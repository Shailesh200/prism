import { describe, expect, it } from "vitest";
import {
  jobBadgeTone,
  jobStatusLabel,
  canRetryJob,
  canRetryVerification,
  jobBadgePulse,
  jobMessage,
  compactJobError,
  jobShareUrl,
  hostClientLabel,
  formatTokenCount,
  jobContextLabel,
  jobTokensLabel,
  jobUsageLine,
  jobUsageFigures,
} from "./jobs-types.js";

describe("jobStatusLabel", () => {
  it("names the confirm gate Awaiting approval", () => {
    expect(jobStatusLabel("needs_confirm")).toBe("Awaiting approval");
  });
});

describe("jobBadgeTone", () => {
  it("gives Failed and Done different colours", () => {
    expect(jobBadgeTone("error")).toBe("rose");
    expect(jobBadgeTone("done")).toBe("emerald");
  });

  it("keeps live, queued, and blocked statuses distinct", () => {
    expect(jobBadgeTone("running")).toBe("accent");
    expect(jobBadgePulse("running")).toBe(true);
    expect(jobBadgePulse("done")).toBe(false);
    expect(jobBadgeTone("queued")).toBe("brand");
    expect(jobBadgeTone("queued", "low on memory")).toBe("amber");
    expect(jobBadgeTone("needs_confirm")).toBe("amber");
    expect(jobBadgeTone("waiting_on_you")).toBe("amber");
    expect(jobBadgeTone("blocked")).toBe("amber");
    expect(jobBadgeTone("needs_review")).toBe("amber");
    expect(jobBadgeTone("paused")).toBe("violet");
    expect(jobBadgeTone("cancelled")).toBe("neutral");
  });
});

describe("canRetryJob", () => {
  it("is for Failed and Cancelled jobs", () => {
    expect(canRetryJob({ status: "error" })).toBe(true);
    expect(canRetryJob({ status: "cancelled" })).toBe(true);
    expect(canRetryJob({ status: "done" })).toBe(false);
    expect(canRetryJob({ status: "running" })).toBe(false);
    expect(canRetryJob({ status: "paused" })).toBe(false);
  });
});

describe("canRetryVerification", () => {
  it("is for settled Failure or NA, not live NA or Success", () => {
    expect(
      canRetryVerification({ status: "done", verification: "failed" }),
    ).toBe(true);
    expect(canRetryVerification({ status: "done" })).toBe(true);
    expect(
      canRetryVerification({ status: "done", verification: "skipped" }),
    ).toBe(true);
    expect(
      canRetryVerification({ status: "done", verification: "passed" }),
    ).toBe(false);
    expect(canRetryVerification({ status: "running" })).toBe(false);
  });
});

describe("jobMessage", () => {
  it("skips the supervisor Checks failed stamp", () => {
    expect(
      jobMessage({
        lastActivity: "Checks failed",
        resultSummary: "Produced no reviewable change.",
      }),
    ).toBe("Produced no reviewable change.");
  });

  it("keeps a real lastActivity line", () => {
    expect(jobMessage({ lastActivity: "Editing table.ts" })).toBe(
      "Editing table.ts",
    );
  });

  it("does not dump bun -e check output on a compact row", () => {
    expect(
      compactJobError(
        `Checks failed: test failed — app-shell:build | $ bun -e "const parts=['overview.css'"`,
      ),
    ).toBe("Checks failed — app-shell:build");
  });

  it("treats moon SIGTERM as an interrupted check, not a failure", () => {
    expect(
      compactJobError(
        'Checks failed: typecheck failed — cli:typecheck | error: script "typecheck" was terminated by signal SIGTERM (Polite quit request).',
      ),
    ).toMatch(/interrupted/i);
  });

  it("rewrites a blank unexpected-stop stamp into resume copy", () => {
    expect(
      compactJobError(
        "The teammate stopped unexpectedly. Say resume to try again.",
      ),
    ).toBe(
      "The teammate stopped without reporting a result. Say resume to try again.",
    );
  });
});

describe("jobShareUrl", () => {
  it("builds a dashboard Focus URL another agent can open", () => {
    expect(
      jobShareUrl(
        { id: "attention-cards", workspacePath: "/Users/me/Prism" },
        "http://prismhq.localhost:17330/?token=old#/jobs",
        "abc-token",
      ),
    ).toBe(
      "http://prismhq.localhost:17330/?token=abc-token#/dashboard?repo=%2FUsers%2Fme%2FPrism&job=attention-cards",
    );
  });
});

describe("hostClientLabel", () => {
  it("names Cursor, VS Code, and other agentic hosts", () => {
    expect(hostClientLabel("cursor")).toBe("Cursor");
    expect(hostClientLabel("Visual Studio Code")).toBe("VS Code");
    expect(hostClientLabel("vscode")).toBe("VS Code");
    expect(hostClientLabel("console")).toBe("Prism Console");
    expect(hostClientLabel("kilo-code")).toBe("Kilo");
    expect(hostClientLabel("roo-code")).toBe("Roo Code");
    expect(hostClientLabel("codex")).toBe("Codex");
    expect(hostClientLabel()).toBe("—");
  });
});

describe("token usage labels", () => {
  it("formats compact counts", () => {
    expect(formatTokenCount(80)).toBe("80");
    expect(formatTokenCount(1_200)).toBe("1.2k");
    expect(formatTokenCount(12_480)).toBe("12k");
    expect(formatTokenCount(200_000)).toBe("200k");
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
  });

  it("shows live context and billed in/out", () => {
    const usage = {
      inputTokens: 1_200,
      outputTokens: 80,
      contextTokens: 48_200,
      contextWindow: 200_000,
    };
    expect(jobContextLabel(usage)).toBe("48k / 200k");
    expect(jobTokensLabel(usage)).toBe("in 1.2k · out 80");
    expect(jobUsageLine(usage)).toBe("48k / 200k · in 1.2k · out 80");
    expect(jobUsageFigures(usage)).toEqual({
      context: "48k / 200k",
      input: "1.2k",
      output: "80",
    });
  });

  it("labels occupancy without a window as used", () => {
    expect(
      jobContextLabel({
        inputTokens: 25_964,
        outputTokens: 1_877,
        contextTokens: 37_996,
      }),
    ).toBe("38k used");
  });

  it("omits labels when the worker never reported usage", () => {
    expect(jobContextLabel(undefined)).toBeUndefined();
    expect(jobTokensLabel(undefined)).toBeUndefined();
    expect(jobUsageLine(undefined)).toBeUndefined();
    expect(jobUsageFigures(undefined)).toEqual({
      context: "—",
      input: "—",
      output: "—",
    });
  });
});
