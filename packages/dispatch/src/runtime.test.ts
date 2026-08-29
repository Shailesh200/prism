import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDayBriefing } from "./briefing.js";
import { saveConfig } from "./config.js";
import { grantPurpose } from "./consent.js";
import { remember } from "./memory.js";
import { createDispatchRuntime } from "./runtime.js";
import { saveToken, loadToken } from "./tokens.js";
import { loadOAuthApp } from "./oauth-apps.js";
import { authBrokerUrl } from "./broker.js";
import type { GitRunner } from "./git.js";
import type { HttpGet } from "./drivers.js";
import type { WorkerPort } from "./worker.js";
import type { CursorAuthPort } from "./cursor-auth.js";
import { loadJobs, upsertJob } from "./jobs.js";

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
  if (args[0] === "config" && args[1] === "user.name") {
    return { ok: true, stdout: "Shailesh Jha\n", stderr: "" };
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

const missingCursorAuth: CursorAuthPort = {
  async status() {
    return { kind: "missing" };
  },
  async login() {
    throw new Error("login should not run in this test");
  },
};

describe("start-my-day briefing", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("shows git in live, CTAs for unconnected drivers, and a configure hint", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      now: new Date("2026-08-26T10:00:00+05:30"),
    });
    expect(briefing.message).toMatch(/Good morning, Shailesh/);
    expect(briefing.message).toContain("## Yesterday");
    expect(briefing.message).toContain("## Waiting on you");
    expect(briefing.message).toContain("Git:");
    expect(briefing.message).toContain("## Not connected yet");
    expect(briefing.connectCtas.length).toBeGreaterThan(0);
    expect(briefing.connectCtas.some((cta) => /Slack/i.test(cta))).toBe(true);
    expect(briefing.configureHint).toMatch(/configure/i);
    expect(briefing.drivers.every((driver) => !driver.connected)).toBe(true);
  });

  it("includes every connected driver in one briefing", async () => {
    root = await tempRoot();
    await grantPurpose(root, "network.github-user");
    await grantPurpose(root, "network.google-calendar");
    await saveToken(root, "github", { accessToken: "gh" });
    await saveToken(root, "google-calendar", { accessToken: "gc" });
    const http: HttpGet = async () => ({
      ok: true,
      status: 200,
      json: { items: [] },
      text: "{}",
    });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      http,
    });
    expect(
      briefing.drivers.filter((driver) => driver.connected).map((d) => d.id),
    ).toEqual(["github", "google-calendar"]);
  });

  it("refreshes an expired Google Calendar token through Prism Auth", async () => {
    root = await tempRoot();
    await grantPurpose(root, "network.google-calendar");
    await saveToken(root, "google-calendar", {
      accessToken: "expired",
      refreshToken: "refresh-me",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const http: HttpGet = async (_url, headers) => {
      if (headers.Authorization === "Bearer expired") {
        return { ok: false, status: 401, json: {}, text: "401" };
      }
      expect(headers.Authorization).toBe("Bearer fresh");
      return {
        ok: true,
        status: 200,
        json: { items: [{ id: "1", summary: "Standup" }] },
        text: "{}",
      };
    };
    const brokerFetch: typeof fetch = async (input, init) => {
      expect(String(input)).toMatch(/\/oauth\/refresh$/);
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as {
        driver?: string;
        refreshToken?: string;
      };
      expect(body.driver).toBe("google-calendar");
      expect(body.refreshToken).toBe("refresh-me");
      return new Response(
        JSON.stringify({
          accessToken: "fresh",
          refreshToken: "refresh-me",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      http,
      brokerFetch,
    });
    const calendar = briefing.drivers.find(
      (row) => row.id === "google-calendar",
    );
    expect(calendar?.error).toBeUndefined();
    expect(calendar?.items[0]?.title).toBe("Standup");
    expect((await loadToken(root, "google-calendar"))?.accessToken).toBe(
      "fresh",
    );
  });

  it("retries Calendar once after a 401 when expiry is unknown", async () => {
    root = await tempRoot();
    await grantPurpose(root, "network.google-calendar");
    await saveToken(root, "google-calendar", {
      accessToken: "stale",
      refreshToken: "refresh-me",
    });
    let calls = 0;
    const http: HttpGet = async (_url, headers) => {
      calls += 1;
      if (headers.Authorization === "Bearer stale") {
        return { ok: false, status: 401, json: {}, text: "401" };
      }
      return {
        ok: true,
        status: 200,
        json: { items: [{ id: "2", summary: "Sync" }] },
        text: "{}",
      };
    };
    const brokerFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          accessToken: "fresh",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      http,
      brokerFetch,
    });
    expect(calls).toBe(2);
    expect(
      briefing.drivers.find((row) => row.id === "google-calendar")?.items[0]
        ?.title,
    ).toBe("Sync");
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
    expect(briefing.message).toContain("### Slack");
    expect(briefing.message).toContain("### GitHub");
    expect(briefing.git.branch).toBe("main");
  });

  it("keeps Linear in Waiting on you after connect even with no open issues", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      now: new Date("2026-08-26T10:00:00+05:30"),
      snapshots: {
        linear: {
          id: "linear",
          connected: true,
          available: true,
          items: [],
          recentlyDone: [
            { id: "d1", title: "ENG-1 Shipped connect", detail: "completed" },
          ],
          viewerName: "Shailesh",
        },
      },
    });
    expect(briefing.message).toContain("Good morning, Shailesh.");
    expect(briefing.message).toContain("### Linear");
    expect(briefing.message).toContain("Nothing waiting.");
    expect(briefing.message).toContain("ENG-1 Shipped connect");
    expect(briefing.connectCtas.some((cta) => /Linear/i.test(cta))).toBe(false);
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
    await saveConfig(root, { maxJobs: 2 });
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

  it("follows getWorkspaceRoot when the MCP client later reports the repo", async () => {
    root = await tempRoot();
    const trees: string[] = [];
    const liveGit: GitRunner = async (cwd, args) => {
      if (args[0] === "worktree" && args[1] === "add") {
        trees.push(cwd);
      }
      return git(cwd, args);
    };
    let liveRoot = root;
    const runtime = createDispatchRuntime({
      workspaceRoot: "/not-the-repo",
      getWorkspaceRoot: () => liveRoot,
      git: liveGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    liveRoot = root;
    const result = (await runtime.handle("start_job", {
      title: "from-roots",
      prd: "Use the live workspace",
    })) as { job?: { worktreePath: string }; message: string };
    expect(result.job).toBeDefined();
    expect(trees).toEqual([root]);
    expect(result.message).not.toMatch(/git repository/i);
  });

  it("returns a spoken error instead of throwing when git cannot see a repo", async () => {
    root = await tempRoot();
    const noGit: GitRunner = async () => ({
      ok: false,
      stdout: "",
      stderr:
        "fatal: not a git repository (or any of the parent directories): .git",
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: noGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("start_job", {
      title: "Review PR 5631",
      prd: "Review the pull request",
    })) as { message: string; job?: unknown };
    expect(result.job).toBeUndefined();
    expect(result.message).toMatch(/git repository/i);
    expect(result.message).toMatch(/PRISM_WORKSPACE/);
    expect(result.message).not.toMatch(/fatal:/);
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
    expect(result.message).toMatch(/didn’t start|didn't start/i);
    expect(result.message).not.toMatch(/@cursor\/sdk|API key/i);
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
    expect(prompt).toContain("bun install");
    expect(prompt).toContain("UI polish");
  });

  it("starts a worker from a stored Cursor SDK login without CURSOR_API_KEY", async () => {
    root = await tempRoot();
    const stored: CursorAuthPort = {
      async status() {
        return { kind: "stored", email: "dev@prism.test" };
      },
      async login() {
        throw new Error("should not login");
      },
    };
    let sawKey: string | undefined = "unset";
    const capturing: WorkerPort = {
      async start(input) {
        sawKey = input.apiKey;
        return { agentId: "agent-stored" };
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
      env: {},
      cursorAuth: stored,
    });
    const result = (await runtime.handle("start_job", {
      title: "audit",
      jobId: "audit-1",
    })) as { job: { status: string; cursorAgentId?: string }; message: string };
    expect(result.job.status).toBe("running");
    expect(result.job.cursorAgentId).toBe("agent-stored");
    expect(sawKey).toBeUndefined();
    expect(result.message).toMatch(/audit/i);
    expect(result.message).not.toMatch(/job-[0-9a-f]{8}|API key|mcp\.json/i);
  });

  it("uses a title slug as the canonical job id", async () => {
    root = await tempRoot();
    let workerName = "";
    const capturing: WorkerPort = {
      async start(input) {
        workerName = input.name ?? "";
        return { agentId: "agent-slug" };
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
    const result = (await runtime.handle("start_job", {
      title: "Audit issues in this repo",
      prd: "Find real issues",
    })) as { job: { id: string; title: string }; message: string };
    expect(result.job.id).toBe("audit-issues-in-this-repo");
    expect(workerName).toBe("Prism · Audit issues in this repo");
    expect(result.message).toMatch(/where are we/i);
    expect(result.message).not.toMatch(/job-[0-9a-f]{8}/i);
  });

  it("runs Cursor login from start_job when nothing is stored", async () => {
    root = await tempRoot();
    const loggingIn: CursorAuthPort = {
      async status() {
        return { kind: "missing" };
      },
      async login() {
        return { apiKey: "minted", expiresAtMs: Date.now() + 1_000 };
      },
    };
    let usedKey = "";
    const capturing: WorkerPort = {
      async start(input) {
        usedKey = input.apiKey ?? "";
        return { agentId: "agent-login" };
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
      env: {},
      cursorAuth: loggingIn,
    });
    const result = (await runtime.handle("start_job", {
      title: "audit",
      jobId: "audit-2",
    })) as { job: { status: string } };
    expect(result.job.status).toBe("running");
    expect(usedKey).toBe("minted");
  });

  it("init reports ready after Cursor login without writing mcp.json", async () => {
    root = await tempRoot();
    const loggingIn: CursorAuthPort = {
      async status() {
        return { kind: "missing" };
      },
      async login() {
        return {
          apiKey: "minted",
          email: "dev@prism.test",
          expiresAtMs: Date.now() + 1_000,
        };
      },
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: {},
      cursorAuth: loggingIn,
      fetchImpl: mockBrokerFetch(),
    });
    const result = (await runtime.handle("init", {})) as {
      ready: boolean;
      message: string;
    };
    expect(result.ready).toBe(true);
    expect(result.message).toMatch(/set/i);
    expect(result.message).not.toMatch(/mcp\.json|API key|connector/i);
  });
});

describe("worker role and doctor", () => {
  it("hides start_job, start_my_day, and init for workers", async () => {
    const runtime = createDispatchRuntime({
      workspaceRoot: "/tmp",
      env: { PRISM_DISPATCH_ROLE: "worker" },
    });
    const result = (await runtime.handle("start_job", { title: "x" })) as {
      message: string;
    };
    expect(result.message).toMatch(/worker/i);
    const init = (await runtime.handle("init", {})) as { message: string };
    expect(init.message).toMatch(/worker/i);
  });

  it("reports missing Cursor workers without failing briefing", async () => {
    const root = await tempRoot();
    try {
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git,
        env: {},
        fetchImpl: mockBrokerFetch(),
        cursorAuth: missingCursorAuth,
      });
      const doctor = (await runtime.handle("dispatch_doctor", {})) as {
        checks: { id: string; ok: boolean }[];
      };
      expect(doctor.checks.find((check) => check.id === "git")?.ok).toBe(true);
      expect(
        doctor.checks.find((check) => check.id === "cursor_workers")?.ok,
      ).toBe(false);
      const day = (await runtime.handle("start_my_day", {})) as {
        git: { branch: string };
      };
      expect(day.git.branch).toBe("main");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tells the user when doctor cannot see a git repository", async () => {
    const root = await tempRoot();
    try {
      const noGit: GitRunner = async () => ({
        ok: false,
        stdout: "",
        stderr:
          "fatal: not a git repository (or any of the parent directories): .git",
      });
      const runtime = createDispatchRuntime({
        workspaceRoot: root,
        git: noGit,
        env: {},
        fetchImpl: mockBrokerFetch(),
        cursorAuth: missingCursorAuth,
      });
      const doctor = (await runtime.handle("dispatch_doctor", {})) as {
        checks: { id: string; ok: boolean }[];
        message: string;
      };
      expect(doctor.checks.find((check) => check.id === "git")?.ok).toBe(false);
      expect(doctor.message).toMatch(/git repository/i);
      expect(doctor.message).not.toMatch(/fatal:/);
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

describe("live status and completion inbox", () => {
  let root = "";
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
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("reaps a dead worker and speaks a failure in where-are-we", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "audit-issues",
      title: "Audit issues",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/audit-issues",
      worktreePath: root,
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      workerPid: 99999999,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const listed = (await runtime.handle("list_jobs", {})) as {
      message: string;
      jobs: { status: string }[];
    };
    expect(listed.jobs[0]?.status).toBe("error");
    expect(listed.message).toMatch(/failed/i);
    expect(listed.message).toMatch(/stopped unexpectedly/i);
    expect(listed.message).not.toMatch(/API key|mcp\.json|99999999/i);
    expect((await loadJobs(root))[0]?.status).toBe("error");
  });

  it("leads where-are-we with a finished result summary", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "audit-issues",
      title: "Audit issues",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/audit-issues",
      worktreePath: root,
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      resultSummary: "3 files changed. Slimmed the lighthouse runner.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const listed = (await runtime.handle("list_jobs", {})) as {
      message: string;
    };
    expect(listed.message).toMatch(/finished/i);
    expect(listed.message).toMatch(/lighthouse/i);
    const day = (await runtime.handle("start_my_day", {})) as {
      message: string;
    };
    expect(day.message).toMatch(/## Yesterday/i);
    expect(day.message).toMatch(/lighthouse/i);
  });

  it("passes the job id into the worker port so the sidecar can be named", async () => {
    root = await tempRoot();
    let jobId = "";
    const capturing: WorkerPort = {
      async start(input) {
        jobId = input.jobId;
        return { agentId: "agent-id" };
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
    await runtime.handle("start_job", {
      title: "AI-971 login",
      prd: "Ship it",
    });
    expect(jobId).toBe("AI-971");
  });
});
