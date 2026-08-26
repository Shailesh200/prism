import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDayBriefing } from "./briefing.js";
import { saveConfig } from "./config.js";
import { grantPurpose } from "./consent.js";
import { remember } from "./memory.js";
import { createDispatchRuntime } from "./runtime.js";
import { saveToken } from "./tokens.js";
import { loadOAuthApp } from "./oauth-apps.js";
import { authBrokerUrl } from "./broker.js";
import type { GitRunner } from "./git.js";
import type { WorkerPort } from "./worker.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-dispatch-"));
}

const git: GitRunner = async (_cwd, args) => {
  if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
    return { ok: true, stdout: "main\n", stderr: "" };
  }
  if (args[0] === "status") {
    return { ok: true, stdout: " M src/app.ts\n", stderr: "" };
  }
  if (args[0] === "log") {
    return { ok: true, stdout: "abc commit\n", stderr: "" };
  }
  if (args[0] === "rev-list") {
    return { ok: true, stdout: "0\t1\n", stderr: "" };
  }
  if (args[0] === "worktree") {
    return { ok: true, stdout: "", stderr: "" };
  }
  return { ok: true, stdout: "", stderr: "" };
};

const DRIVER_IDS = [
  "github",
  "linear",
  "jira",
  "slack",
  "notion",
  "google-calendar",
] as const;

function mockBrokerFetch(
  enabled: Partial<Record<(typeof DRIVER_IDS)[number], boolean>> = {},
): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("/oauth/drivers")) {
      return new Response(
        JSON.stringify({
          drivers: DRIVER_IDS.map((id) => ({
            id,
            enabled: enabled[id] === true,
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };
}

describe("start-my-day briefing", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("shows git in live, CTAs for unconnected drivers, and a configure hint", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({ workspaceRoot: root, git });
    expect(briefing.message).toContain("## Live");
    expect(briefing.message).toContain("Git:");
    expect(briefing.message).toContain("## Available");
    expect(briefing.connectCtas.length).toBeGreaterThan(0);
    expect(briefing.connectCtas.some((cta) => /Slack/i.test(cta))).toBe(true);
    expect(briefing.configureHint).toMatch(/configure/i);
    expect(briefing.drivers.every((driver) => !driver.connected)).toBe(true);
  });

  it("hides the configure band when hints are off", async () => {
    root = await tempRoot();
    await saveConfig(root, { hints: false });
    const briefing = await buildDayBriefing({ workspaceRoot: root, git });
    expect(briefing.configureHint).toBeUndefined();
    expect(briefing.message).not.toContain("## Configure");
  });

  it("keeps Slack errors from wiping the rest of the briefing", async () => {
    root = await tempRoot();
    await grantPurpose(root, "network.slack");
    await saveToken(root, "slack", { accessToken: "xoxp-test" });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      snapshots: {
        slack: {
          id: "slack",
          connected: true,
          available: false,
          error: "missing_scope",
          items: [],
        },
        github: {
          id: "github",
          connected: true,
          available: true,
          items: [{ id: "1", title: "PR review", detail: "review requested" }],
        },
      },
    });
    expect(briefing.message).toContain("PR review");
    expect(briefing.message).toContain("missing_scope");
    expect(briefing.git.branch).toBe("main");
  });

  it("caps Slack mention items in the formatted briefing", async () => {
    root = await tempRoot();
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      title: `mention ${i}`,
      detail: "mention",
    }));
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      snapshots: {
        slack: { id: "slack", connected: true, available: true, items },
      },
    });
    const mentionLines = briefing.message
      .split("\n")
      .filter((line) => line.includes("mention "));
    expect(mentionLines.length).toBeLessThanOrEqual(8);
  });
});

describe("remember + configure", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("stores a memory and lists it", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    await runtime.handle("remember", {
      action: "add",
      text: "Prefer bun over npm in this repo",
      scope: "repo",
    });
    const listed = (await runtime.handle("remember", { action: "list" })) as {
      items: { text: string }[];
    };
    expect(listed.items.some((item) => item.text.includes("bun"))).toBe(true);
  });

  it("requires confirm for a code-changing rule", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    const result = (await runtime.handle("remember", {
      text: "Always rewrite every test to vitest",
    })) as { needsConfirm?: boolean };
    expect(result.needsConfirm).toBe(true);
  });

  it("persists configure maxJobs and slack channels", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    const result = (await runtime.handle("configure", {
      action: "set",
      maxJobs: 3,
      slackTrackChannelIds: ["C123"],
      ticketHost: "jira",
    })) as { config: { maxJobs: number; ticketHost: string } };
    expect(result.config.maxJobs).toBe(3);
    expect(result.config.ticketHost).toBe("jira");
  });

  it("exports a non-secret settings template", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    await runtime.handle("configure", {
      action: "set",
      slackTrackChannelIds: ["C999"],
    });
    const exported = (await runtime.handle("configure", {
      action: "export",
    })) as { settings: { slackTrackChannelIds: string[] } };
    expect(exported.settings.slackTrackChannelIds).toEqual(["C999"]);
    expect(JSON.stringify(exported)).not.toMatch(/accessToken|xoxp-|ghp_/);
  });
});

describe("jobs, worktrees, overlap, cap", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  const worker: WorkerPort = {
    async start() {
      return { agentId: "agent-test" };
    },
    async resume() {},
    async cancel() {},
    async status() {
      return { status: "running", detail: "agent-test" };
    },
  };

  it("adopts a matching git worktree instead of creating one", async () => {
    root = await tempRoot();
    const adoptGit: GitRunner = async (_cwd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          ok: true,
          stdout: [
            "worktree /tmp/cursor-trees/AI-971",
            "HEAD abc",
            "branch refs/heads/feat/AI-971-login",
            "",
          ].join("\n"),
          stderr: "",
        };
      }
      if (args[0] === "status") return { ok: true, stdout: "", stderr: "" };
      return git(_cwd, args);
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: adoptGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("start_job", {
      title: "AI-971 login",
      prd: "Ship login",
    })) as { job: { worktreePath: string; source: string; id: string } };
    expect(result.job.id).toBe("AI-971");
    expect(result.job.worktreePath).toBe("/tmp/cursor-trees/AI-971");
    expect(result.job.source).toBe("cursor");
  });

  it("asks for confirm when a second job would share a dirty tree", async () => {
    root = await tempRoot();
    const sharedGit: GitRunner = async (_cwd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          ok: true,
          stdout: [
            "worktree /tmp/shared",
            "HEAD abc",
            "branch refs/heads/feat/shared",
            "",
          ].join("\n"),
          stderr: "",
        };
      }
      if (args[0] === "status")
        return { ok: true, stdout: " M dirty.ts\n", stderr: "" };
      return git(_cwd, args);
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: sharedGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await runtime.handle("start_job", { title: "first", jobId: "share" });
    const second = (await runtime.handle("start_job", {
      title: "second",
      jobId: "shared",
    })) as { needsConfirm?: boolean };
    expect(second.needsConfirm).toBe(true);
  });

  it("refuses a new job past maxJobs", async () => {
    root = await tempRoot();
    await saveConfig(root, { maxJobs: 1 });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await runtime.handle("start_job", {
      title: "first",
      jobId: "one",
    });
    const blocked = (await runtime.handle("start_job", {
      title: "second",
      jobId: "two",
    })) as { maxJobs?: number; message: string };
    expect(blocked.maxJobs).toBe(1);
    expect(blocked.message).toMatch(/job cap/i);
  });

  it("records the job when the worker fails to start", async () => {
    root = await tempRoot();
    const exploding: WorkerPort = {
      async start() {
        throw new Error("@cursor/sdk is not installed");
      },
      async resume() {},
      async cancel() {},
      async status() {
        return { status: "unknown", detail: "" };
      },
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: exploding,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("start_job", {
      title: "blocked worker",
      jobId: "bw1",
    })) as { job: { status: string }; message: string };
    expect(result.job.status).toBe("blocked");
    expect(result.message).toMatch(/not installed/);
  });

  it("injects memories into the worker prompt", async () => {
    root = await tempRoot();
    await remember({
      workspaceRoot: root,
      text: "Use existing Button primitive",
      scope: "repo",
    });
    let prompt = "";
    const capturing: WorkerPort = {
      async start(input) {
        prompt = input.prompt;
        return { agentId: "agent-mem" };
      },
      async resume() {},
      async cancel() {},
      async status() {
        return { status: "running", detail: "" };
      },
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: capturing,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await runtime.handle("start_job", { title: "UI polish", prd: "Polish" });
    expect(prompt).toContain("Use existing Button primitive");
    expect(prompt).toContain("blast_radius");
  });
});

describe("worker role and doctor", () => {
  it("hides start_job and start_my_day for workers", async () => {
    const runtime = createDispatchRuntime({
      workspaceRoot: "/tmp",
      env: { PRISM_DISPATCH_ROLE: "worker" },
    });
    const result = (await runtime.handle("start_job", { title: "x" })) as {
      message: string;
    };
    expect(result.message).toMatch(/worker/i);
  });

  it("reports a missing API key without failing briefing", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        env: {},
        fetchImpl: mockBrokerFetch(),
      });
      const doctor = (await runtime.handle("dispatch_doctor", {})) as {
        checks: { id: string; ok: boolean }[];
      };
      expect(
        doctor.checks.find((check) => check.id === "cursor_api_key")?.ok,
      ).toBe(false);
      const day = (await runtime.handle("start_my_day", {})) as {
        git: { branch: string };
      };
      expect(day.git.branch).toBe("main");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses injected OAuth instead of opening a browser", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        startOAuth: async (driver) => ({
          driver,
          connected: true,
          message: `fake connected ${driver}`,
        }),
      });
      const result = (await runtime.handle("integrations", {
        action: "start",
        driver: "linear",
      })) as { message: string };
      expect(result.message).toContain("linear");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("connects through Prism Auth without asking for a client id", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        env: {},
        fetchImpl: mockBrokerFetch(),
      });
      const result = (await runtime.handle("integrations", {
        action: "connect",
        driver: "google calendar",
      })) as {
        brokerEnabled?: boolean;
        message: string;
      };
      expect(result.brokerEnabled).toBe(false);
      expect(result.message).toMatch(/Prism Auth/i);
      expect(result.message).toMatch(/do not create an OAuth client/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stores a pasted OAuth client id so connect can retry without a reload", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        env: {},
        fetchImpl: mockBrokerFetch(),
        startOAuth: async (driver) => ({
          driver,
          message: `would open browser for ${driver}`,
        }),
      });
      await runtime.handle("integrations", {
        action: "connect",
        driver: "google calendar",
        clientId: "abc.apps.googleusercontent.com",
        clientSecret: "s3cret",
      });
      const saved = await loadOAuthApp(root, "google-calendar");
      expect(saved?.clientId).toBe("abc.apps.googleusercontent.com");
      const catalog = (await runtime.handle("integrations", {
        action: "catalog",
      })) as {
        drivers: { id: string; connectReady: boolean }[];
        broker: string;
      };
      expect(catalog.broker).toBe(authBrokerUrl({}));
      expect(
        catalog.drivers.find((row) => row.id === "google-calendar")
          ?.connectReady,
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stops at the first native step when the user declines Connect", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        env: {},
        fetchImpl: mockBrokerFetch({ "google-calendar": true }),
        oauthUi: {
          async reportStep() {},
          async confirmConnect() {
            return false;
          },
          async beginAuth() {
            throw new Error("must not start Authenticate after decline");
          },
        },
      });
      const result = (await runtime.handle("integrations", {
        action: "connect",
        driver: "google calendar",
      })) as {
        cancelled?: boolean;
        steps?: { id: string; status: string }[];
        message: string;
      };
      expect(result.cancelled).toBe(true);
      expect(result.steps?.find((step) => step.id === "confirm")?.status).toBe(
        "failed",
      );
      expect(result.message).toMatch(/Cancelled connecting Google Calendar/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
