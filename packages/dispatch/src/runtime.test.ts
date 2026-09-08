import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDayBriefing } from "./briefing.js";
import type { HostConnector } from "./host-connectors.js";
import { saveConfig } from "./config.js";
import { remember } from "./memory.js";
import { createDispatchRuntime } from "./runtime.js";
import { dispatchAndDrain, drain } from "./drain-harness.js";
import type { GitRunner } from "./git.js";
import type { WorkerPort } from "./worker.js";
import type { CursorAuthPort } from "./cursor-auth.js";
import { loadJobs, upsertJob } from "./jobs.js";
import type { JobRecord } from "./types.js";
import { appendRunLog, lifecycleLogEntry } from "./run-log.js";
import { reapJobs, writeRunState } from "./run-state.js";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "prism-dispatch-"));
}

async function rmTree(path: string): Promise<void> {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 40,
  });
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
    if (root) await rmTree(root);
  });

  const slack: HostConnector = {
    id: "slack",
    label: "Slack",
    hosts: ["cursor"],
    skills: [],
    source: "/fake",
  };
  const linear: HostConnector = {
    id: "linear",
    label: "Linear",
    hosts: ["cursor"],
    skills: [],
    source: "/fake",
  };

  it("gives the local spine and a configure hint", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [],
      now: new Date("2026-08-26T10:00:00+05:30"),
    });
    expect(briefing.message).toMatch(/Good morning, Shailesh/);
    expect(briefing.message).toContain("## Yesterday");
    expect(briefing.message).toContain("## Waiting on you");
    expect(briefing.message).toContain("Git:");
    expect(briefing.configureHint).toMatch(/configure/i);
  });

  // The core of ADR-0049: Prism names the section, the host fills it.
  it("asks the host to fill the sections its connectors can serve", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [slack, linear],
    });
    const sections = briefing.fill.requests.map((row) => row.section);
    expect(sections).toContain("tickets");
    expect(sections).toContain("messages");
    expect(briefing.message).toContain("Fill these from your own connectors");
    expect(briefing.message).toMatch(/\*\*Tickets\*\* — via linear/);
  });

  it("names a section it cannot fill rather than dropping the heading", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [slack],
    });
    expect(briefing.fill.unfillable).toContain("tickets");
    expect(briefing.fill.unfillable).toContain("reviews");
    expect(briefing.message).toContain("No connector for:");
  });

  it("says nothing about connectors on a machine that has none", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [],
    });
    expect(briefing.fill.requests).toEqual([]);
    expect(briefing.message).not.toContain("Fill these from your own");
    expect(briefing.message).toContain("No connector for:");
  });

  // A Jira shop should not be asked about Linear just because the plugin is
  // installed for some other project.
  it("respects the configured ticket host", async () => {
    root = await tempRoot();
    await saveConfig(root, { ticketHost: "jira" });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [linear],
    });
    expect(briefing.fill.unfillable).toContain("tickets");
  });

  it("reports what the host has, with no credential field to leak", async () => {
    root = await tempRoot();
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [slack],
    });
    expect(briefing.connectors.map((row) => row.label)).toEqual(["Slack"]);
    expect(JSON.stringify(briefing.connectors)).not.toMatch(
      /token|secret|accessToken/i,
    );
  });

  it("hides the configure band when hints are off", async () => {
    root = await tempRoot();
    await saveConfig(root, { hints: false });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [],
    });
    expect(briefing.configureHint).toBeUndefined();
    expect(briefing.message).not.toContain("## Configure");
  });

  it("stops asking for Slack when that standup section is off", async () => {
    root = await tempRoot();
    await saveConfig(root, { sectionsOff: ["slack"] });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [slack],
    });
    expect(briefing.fill.requests.map((row) => row.section)).not.toContain(
      "messages",
    );
    expect(briefing.message).not.toContain("**Messages**");
  });

  it("puts saved Slack channels into the standup fill contract", async () => {
    root = await tempRoot();
    await saveConfig(root, {
      slackTrackChannelIds: ["C01234567"],
      mentionWindowHours: 6,
      mentionLimit: 4,
    });
    const briefing = await buildDayBriefing({
      workspaceRoot: root,
      git,
      connectors: [slack],
    });
    const messages = briefing.fill.requests.find(
      (row) => row.section === "messages",
    );
    expect(messages?.ask).toContain("C01234567");
    expect(messages?.ask).toContain("6 hour");
    expect(messages?.ask).toContain("at most 4");
  });
});

describe("remember + configure", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rmTree(root);
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

  it("keeps standing preferences and lists them (M-066 P-P9)", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    const added = (await runtime.handle("configure", {
      action: "set",
      preference: "standup: terse, no headings",
    })) as { config: { preferences: string[] }; message: string };
    expect(added.config.preferences).toEqual(["standup: terse, no headings"]);
    expect(added.message).toMatch(/noted/i);

    const listed = (await runtime.handle("configure", {
      action: "get",
    })) as { message: string };
    expect(listed.message).toContain("standup: terse");

    const removed = (await runtime.handle("configure", {
      action: "set",
      removePreference: "terse",
    })) as { config: { preferences: string[] }; message: string };
    expect(removed.config.preferences).toEqual([]);
    expect(removed.message).toMatch(/dropped/i);
  });

  it("never silently drops an unknown setting — it becomes a preference, loudly", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    const result = (await runtime.handle("configure", {
      action: "set",
      maxjobs: 2,
    })) as {
      config: { maxJobs: number; preferences: string[] };
      message: string;
    };
    // The typo did not set maxJobs…
    expect(result.config.maxJobs).toBe(4);
    // …and it was not silently dropped either.
    expect(result.config.preferences).toEqual(["maxjobs: 2"]);
    expect(result.message).toMatch(/not a Dispatch setting/i);
  });

  it("carries standing preferences into the standup briefing", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      fetchImpl: mockBrokerFetch(),
    });
    await runtime.handle("configure", {
      action: "set",
      preference: "greet me as Chief",
    });
    const day = (await runtime.handle("start_my_day", {})) as {
      message: string;
    };
    expect(day.message).toContain("greet me as Chief");
  });

  it("does not repeat standup notes that are already in the template", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      fetchImpl: mockBrokerFetch(),
    });
    await runtime.handle("configure", {
      action: "set",
      standupTemplate: "greet me by name\nstandup: terse",
      preference: "standup: terse",
    });
    const day = (await runtime.handle("start_my_day", {})) as {
      message: string;
    };
    expect(day.message.match(/standup: terse/g)?.length).toBe(1);
  });

  it("stores standing job instructions on configure", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({ workspaceRoot: root, git });
    const result = (await runtime.handle("configure", {
      action: "set",
      jobInstructions: "Prefer small diffs.",
    })) as { config: { jobInstructions: string }; message: string };
    expect(result.config.jobInstructions).toBe("Prefer small diffs.");
    expect(result.message).toContain("Prefer small diffs.");
  });
});

describe("jobs, worktrees, overlap, cap", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rmTree(root);
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
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "AI-971 login",
      prd: "Ship login",
    });
    expect(result.job?.id).toBe("AI-971");
    expect(result.job?.worktreePath).toBe("/tmp/cursor-trees/AI-971");
    expect(result.job?.source).toBe("cursor");
  });

  it("asks for confirm when a second job would share a dirty tree", async () => {
    root = await tempRoot();
    await saveConfig(root, { maxJobs: 2, placement: "worktree" });
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
    await dispatchAndDrain(runtime, { title: "first", jobId: "share" });
    const second = await dispatchAndDrain(runtime, {
      title: "second",
      jobId: "shared",
    });
    // The overlap gate leaves a job the board can show and answer, rather
    // than a bare needsConfirm flag that dies with the chat turn (ADR-0047).
    expect(second.job?.status).toBe("needs_confirm");
    expect(second.job?.confirm?.arg).toBe("confirmOverlap");
  });

  it("refuses a new job past maxJobs", async () => {
    root = await tempRoot();
    await saveConfig(root, { maxJobs: 1, placement: "worktree" });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await dispatchAndDrain(runtime, { title: "first", jobId: "one" });
    const second = await dispatchAndDrain(runtime, {
      title: "second",
      jobId: "two",
    });
    // Past the cap the job now waits instead of being refused. Nothing is
    // lost, and it starts by itself when a slot frees (ADR-0047).
    expect(second.job?.status).toBe("queued");
    expect(second.job?.nextStep).toMatch(/job cap/i);

    // Free the slot and the queue moves on its own.
    await runtime.handle("job_control", { jobId: "one", action: "cancel" });
    const after = await drain(runtime);
    expect(after.find((row) => row.id === "two")?.status).toBe("running");
  });

  it("delete removes a job from the board entirely", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await dispatchAndDrain(runtime, { title: "gone soon", jobId: "gone" });
    await runtime.handle("job_control", { jobId: "gone", action: "cancel" });
    const deleted = (await runtime.handle("job_control", {
      jobId: "gone",
      action: "delete",
    })) as { message: string; deleted?: boolean };
    expect(deleted.deleted).toBe(true);
    expect(deleted.message).toMatch(/Deleted/i);
    expect(await loadJobs(root)).toEqual([]);
  });

  it("follows getWorkspaceRoot when the MCP client later reports the repo", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "from-roots",
      prd: "Use the live workspace",
    });
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
    const result = await dispatchAndDrain(runtime, {
      title: "Review PR 5631",
      prd: "Review the pull request",
    });
    // "No repository here" is rejected at accept time rather than queued
    // (ADR-0047). Unlike a dirty tree or a busy machine, nothing about waiting
    // fixes it, so there is no job to persist — only an answer.
    expect(result.accepted.job).toBeUndefined();
    expect(result.message).toMatch(/git repository/i);
    expect(result.message).not.toMatch(/fatal:/);
  });

  it("blocks rather than drops a job when git fails after accepting it", async () => {
    root = await tempRoot();
    let probed = false;
    // Healthy on the accept-time probe, broken by the time the drain runs —
    // the interesting case, because the job already exists on disk.
    const flaky: GitRunner = async (_cwd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir" && !probed) {
        probed = true;
        return { ok: true, stdout: ".git", stderr: "" };
      }
      return { ok: false, stdout: "", stderr: "fatal: git exploded" };
    };
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: flaky,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = await dispatchAndDrain(runtime, {
      title: "Review PR 5632",
      prd: "Review the pull request",
    });
    expect(result.job?.status).toBe("blocked");
    expect(result.job?.waitingOn).toBe("git");
    expect(result.job?.nextStep).toBeTruthy();
  });

  it("records the job when the worker fails to start", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "blocked worker",
      jobId: "bw1",
    });
    expect(result.job?.status).toBe("blocked");
    expect(result.job?.nextStep).toMatch(/didn’t start|didn't start/i);
    expect(result.job?.nextStep).not.toMatch(/@cursor\/sdk|API key/i);
  });

  it("injects memories into the worker prompt", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    await dispatchAndDrain(runtime, { title: "UI polish", prd: "Polish" });
    expect(prompt).toContain("Use existing Button primitive");
    expect(prompt).toContain("bun install");
    expect(prompt).toContain("UI polish");
  });

  it("injects standing job instructions into the worker prompt", async () => {
    root = await tempRoot();
    await saveConfig(root, {
      placement: "worktree",
      jobInstructions: "Prefer small diffs.",
    });
    let prompt = "";
    const capturing: WorkerPort = {
      async start(input) {
        prompt = input.prompt;
        return { agentId: "agent-instr" };
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
    await dispatchAndDrain(runtime, { title: "UI polish", prd: "Polish" });
    expect(prompt).toContain("Standing job instructions from the user:");
    expect(prompt).toContain("Prefer small diffs.");
  });

  it("honors compose checkout when settings prefer an isolated worktree", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("start_job", {
      title: "Stay in this folder",
      prd: "Edit here",
      placement: "checkout",
    })) as { job: { placement: string } };
    expect(result.job.placement).toBe("checkout");
  });

  it("starts a worker from a stored Cursor SDK login without CURSOR_API_KEY", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "audit",
      jobId: "audit-1",
    });
    expect(result.job?.status).toBe("running");
    expect(result.job?.cursorAgentId).toBe("agent-stored");
    expect(sawKey).toBeUndefined();
    expect(result.message).toMatch(/audit/i);
    expect(result.message).not.toMatch(/job-[0-9a-f]{8}|API key|mcp\.json/i);
  });

  it("uses a title slug as the canonical job id", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "Audit issues in this repo",
      prd: "Find real issues",
    });
    expect(result.job?.id).toBe("audit-issues-in-this-repo");
    expect(workerName).toBe("Prism · Audit issues in this repo");
    expect(result.message).toMatch(/where are we/i);
    expect(result.message).not.toMatch(/job-[0-9a-f]{8}/i);
  });

  it("runs Cursor login from start_job when nothing is stored", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    const result = await dispatchAndDrain(runtime, {
      title: "audit",
      jobId: "audit-2",
    });
    expect(result.job?.status).toBe("running");
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
    const sleep = (await runtime.handle("sleep", {})) as { message: string };
    expect(sleep.message).toMatch(/worker/i);
    const wake = (await runtime.handle("wake", {})) as { message: string };
    expect(wake.message).toMatch(/worker/i);
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
      await rmTree(root);
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
      await rmTree(root);
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
    if (root) await rmTree(root);
  });

  it("resume kills a silent stalled worker then respawns", async () => {
    root = await tempRoot();
    let cancelled = false;
    let resumed = false;
    const stallWorker: WorkerPort = {
      async start() {
        return { agentId: "agent-new", pid: 4242 };
      },
      async resume() {
        resumed = true;
        return { pid: 4242 };
      },
      async cancel() {
        cancelled = true;
      },
      async status() {
        return { status: "running", detail: "agent-test" };
      },
    };
    await upsertJob(root, {
      id: "stalled-job",
      title: "Stalled job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/stalled-job",
      worktreePath: root,
      source: "prism",
      status: "waiting_on_you",
      lastStep: "",
      nextStep: "say resume to nudge it, or cancel",
      waitingOn: "stalled",
      workerPid: process.pid,
      cursorAgentId: "agent-stalled",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: stallWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "stalled-job",
      action: "resume",
    })) as { job: { status: string; waitingOn: string }; message: string };
    expect(cancelled).toBe(true);
    expect(resumed).toBe(true);
    expect(result.job.status).toBe("running");
    expect(result.job.waitingOn).toBe("");
  });

  it("resume on a live non-stalled job says already running", async () => {
    root = await tempRoot();
    let cancelled = false;
    const liveWorker: WorkerPort = {
      async start() {
        return { agentId: "agent-test" };
      },
      async resume() {},
      async cancel() {
        cancelled = true;
      },
      async status() {
        return { status: "running", detail: "agent-test" };
      },
    };
    await upsertJob(root, {
      id: "live-job",
      title: "Live job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/live-job",
      worktreePath: root,
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      workerPid: process.pid,
      cursorAgentId: "agent-live",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: liveWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "live-job",
      action: "resume",
    })) as { message: string };
    expect(cancelled).toBe(false);
    expect(result.message).toMatch(/already running/i);
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
    expect(listed.message).toMatch(/stopped without reporting a result/i);
    expect(listed.message).not.toMatch(/API key|mcp\.json|99999999/i);
    expect((await loadJobs(root))[0]?.status).toBe("error");
  });

  it("does not restart a booting job when start_job is retried", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "console-actions-retry-child-errors-checkout-defa",
      title: "Console actions, retry child, errors, checkout default",
      playbook: "ticket",
      prd: "do the work",
      branch: "main",
      worktreePath: root,
      source: "checkout",
      status: "booting",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    let starts = 0;
    const counting: WorkerPort = {
      async start() {
        starts += 1;
        return { agentId: "agent-boot" };
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
      worker: counting,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("start_job", {
      title: "Console actions, retry child, errors, checkout default",
      prd: "do the work",
      jobId: "console-actions-retry-child-errors-checkout-defa",
    })) as { message: string; job: { status: string } };
    expect(starts).toBe(0);
    expect(result.job.status).toBe("booting");
    expect(result.message).toMatch(/already running/i);
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

  it("waitFor returns immediately for a settled job and speaks why", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "latency-check",
      title: "Latency check",
      playbook: "ticket",
      prd: "",
      branch: "main",
      worktreePath: root,
      source: "checkout",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      resultSummary: "Printed the repo name. Changed nothing.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await appendRunLog(root, "latency-check", {
      ts: new Date().toISOString(),
      phase: "thinking",
      text: "The repository name is Prism. I will not edit any files because the brief said change nothing.",
      level: "info",
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const listed = (await runtime.handle("list_jobs", {
      waitFor: "latency-check",
      timeoutMs: 2000,
    })) as { message: string };
    expect(listed.message).toMatch(/finished/i);
    expect(listed.message).toMatch(/Why it did that/);
    expect(listed.message).toMatch(/change nothing/);
  });

  it("keeps a checkout review file without restoring it", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "latency-check",
      title: "Latency check",
      playbook: "ticket",
      prd: "",
      branch: "main",
      worktreePath: root,
      source: "checkout",
      status: "needs_review",
      lastStep: "",
      nextStep: "review the changes",
      waitingOn: "",
      review: {
        files: [
          { path: "src/job.ts", added: 10, removed: 0, change: "modified" },
          { path: "src/other.ts", added: 2, removed: 1, change: "modified" },
        ],
        totalAdded: 12,
        totalRemoved: 1,
        truncated: false,
        branch: "main",
        baseRef: "HEAD",
        committed: false,
        merged: false,
        mixedPaths: [],
        keptPaths: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const kept = (await runtime.handle("job_control", {
      jobId: "latency-check",
      action: "accept_file",
      path: "src/job.ts",
    })) as { message: string };
    expect(kept.message).toMatch(/Kept src\/job\.ts/);
    const all = (await runtime.handle("job_control", {
      jobId: "latency-check",
      action: "accept_all",
    })) as { message: string; job: { status: string } };
    expect(all.job.status).toBe("done");
    expect(all.message).toMatch(/Kept the changes/);
  });

  it("merges a worktree job onto the current branch on Keep all", async () => {
    root = await tempRoot();
    const gitCalls: string[][] = [];
    const landGit: GitRunner = async (_cwd, args) => {
      gitCalls.push([...args]);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
        return { ok: true, stdout: "main\n", stderr: "" };
      }
      if (args[0] === "rev-list") {
        return { ok: true, stdout: "1\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--short") {
        return { ok: true, stdout: "abc1234\n", stderr: "" };
      }
      if (args[0] === "merge") {
        return { ok: true, stdout: "", stderr: "" };
      }
      return git(_cwd, args);
    };
    await upsertJob(root, {
      id: "land-me",
      title: "Land me",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/land-me",
      worktreePath: root,
      source: "prism",
      placement: "worktree",
      status: "needs_review",
      lastStep: "",
      nextStep: "review the changes",
      waitingOn: "",
      review: {
        files: [
          { path: "src/job.ts", added: 4, removed: 0, change: "modified" },
        ],
        totalAdded: 4,
        totalRemoved: 0,
        truncated: false,
        branch: "dispatch/land-me",
        baseRef: "main",
        committed: true,
        merged: false,
        mixedPaths: [],
        keptPaths: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: landGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "land-me",
      action: "accept_all",
    })) as {
      message: string;
      job: { status: string; review?: { merged?: boolean } };
    };
    expect(result.job.status).toBe("done");
    expect(result.job.review?.merged).toBe(true);
    expect(result.message).toMatch(/Merged .* onto main/);
    expect(
      gitCalls.some(
        (args) => args[0] === "merge" && args.includes("dispatch/land-me"),
      ),
    ).toBe(true);
  });

  it("leaves a worktree job in review when Keep all cannot merge", async () => {
    root = await tempRoot();
    const landGit: GitRunner = async (_cwd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
        return { ok: true, stdout: "main\n", stderr: "" };
      }
      if (args[0] === "rev-list") {
        return { ok: true, stdout: "1\n", stderr: "" };
      }
      if (args[0] === "merge" && args[1] === "--abort") {
        return { ok: true, stdout: "", stderr: "" };
      }
      if (args[0] === "merge") {
        return {
          ok: false,
          stdout: "",
          stderr: "CONFLICT (content): Merge conflict in src/job.ts\n",
        };
      }
      return git(_cwd, args);
    };
    await upsertJob(root, {
      id: "clash",
      title: "Clash",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/clash",
      worktreePath: root,
      source: "prism",
      placement: "worktree",
      status: "needs_review",
      lastStep: "",
      nextStep: "review the changes",
      waitingOn: "",
      review: {
        files: [
          { path: "src/job.ts", added: 1, removed: 1, change: "modified" },
        ],
        totalAdded: 1,
        totalRemoved: 1,
        truncated: false,
        branch: "dispatch/clash",
        baseRef: "main",
        committed: true,
        merged: false,
        mixedPaths: [],
        keptPaths: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git: landGit,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "clash",
      action: "accept_all",
    })) as { message: string; job: { status: string } };
    expect(result.job.status).toBe("needs_review");
    expect(result.message).toMatch(/could not merge/i);
    expect(result.message).toMatch(/conflict/i);
  });

  it("passes the job id into the worker port so the sidecar can be named", async () => {
    root = await tempRoot();
    await saveConfig(root, { placement: "worktree" });
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
    await dispatchAndDrain(runtime, {
      title: "AI-971 login",
      prd: "Ship it",
    });
    expect(jobId).toBe("AI-971");
  });
});

describe("job_logs", () => {
  let root = "";

  const logWorker: WorkerPort = {
    async start() {
      return { agentId: "agent-id" };
    },
    async resume() {},
    async cancel() {},
    async status() {
      return { status: "running", detail: "" };
    },
  };

  afterEach(async () => {
    if (root) await rmTree(root);
    root = "";
  });

  async function seedJob(status = "running"): Promise<void> {
    await upsertJob(root, {
      id: "rms-pagination",
      title: "RMS pagination 100k+ cap",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/rms-pagination",
      worktreePath: root,
      source: "prism",
      status: status as "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      workerPid: process.pid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  it("returns the console for the running job without an id", async () => {
    root = await tempRoot();
    await seedJob();
    await appendRunLog(
      root,
      "rms-pagination",
      lifecycleLogEntry("tool", "Using grep"),
    );
    await appendRunLog(
      root,
      "rms-pagination",
      lifecycleLogEntry("editing", "Editing table.ts"),
    );

    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: logWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_logs", {})) as {
      jobId: string;
      entries: { text: string }[];
      message: string;
    };
    expect(result.jobId).toBe("rms-pagination");
    expect(result.entries.map((entry) => entry.text)).toEqual([
      "Using grep",
      "Editing table.ts",
    ]);
    expect(result.message).toMatch(/Editing table\.ts/);
    expect(result.message).not.toMatch(/worktree|\/tmp\//);
  });

  it("tails only new lines when given since", async () => {
    const workspace = await tempRoot();
    root = workspace;
    await seedJob();
    const first = new Date("2026-01-01T00:00:00.000Z");
    await appendRunLog(
      root,
      "rms-pagination",
      lifecycleLogEntry("thinking", "old", first),
    );
    await appendRunLog(
      root,
      "rms-pagination",
      lifecycleLogEntry("tool", "Using grep", first),
    );
    await appendRunLog(
      root,
      "rms-pagination",
      lifecycleLogEntry(
        "thinking",
        "fresh",
        new Date("2026-01-01T00:01:00.000Z"),
      ),
    );

    const runtime = createDispatchRuntime({
      workspaceRoot: workspace,
      git,
      worker: logWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_logs", {
      since: first.toISOString(),
    })) as { entries: { text: string }[] };
    expect(result.entries.map((entry) => entry.text)).toEqual(["fresh"]);
  });

  it("says so when a job has no console output yet", async () => {
    root = await tempRoot();
    await seedJob();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: logWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_logs", {})) as {
      message: string;
    };
    expect(result.message).toMatch(/No console output yet/i);
  });

  it("names the unknown reference instead of guessing", async () => {
    root = await tempRoot();
    await seedJob();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: logWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_logs", {
      jobId: "nope",
    })) as { message: string };
    expect(result.message).toMatch(/couldn’t find “nope”/i);
  });

  it("has nothing to show before any job exists", async () => {
    root = await tempRoot();
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: logWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_logs", {})) as {
      message: string;
    };
    expect(result.message).toMatch(/No jobs yet/i);
  });
});

describe("retry and reverify", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rmTree(root);
  });

  it("retry on a failed job starts a new teammate instead of resuming", async () => {
    root = await tempRoot();
    let started = false;
    let resumed = false;
    const retryWorker: WorkerPort = {
      async start() {
        started = true;
        return { agentId: "agent-retry", pid: 4300 };
      },
      async resume() {
        resumed = true;
        return { pid: 4300 };
      },
      async cancel() {},
      async status() {
        return { status: "running", detail: "agent-test" };
      },
    };
    await upsertJob(root, {
      id: "failed-job",
      title: "Failed job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/failed-job",
      worktreePath: root,
      source: "prism",
      status: "error",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      workerPid: 1,
      cursorAgentId: "agent-dead",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: retryWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "failed-job",
      action: "retry",
    })) as {
      job: { status: string; id: string; parentJobId?: string };
      message: string;
    };
    expect(started).toBe(true);
    expect(resumed).toBe(false);
    expect(result.job.status).toBe("running");
    expect(result.job.parentJobId).toBe("failed-job");
    expect(result.job.id).not.toBe("failed-job");
    const rows = await loadJobs(root);
    expect(rows.find((job) => job.id === "failed-job")?.status).toBe("error");
  });

  it("retry reports why the teammate failed to start", async () => {
    root = await tempRoot();
    const retryWorker: WorkerPort = {
      async start() {
        throw new Error("Cursor agent refused to launch");
      },
      async resume() {},
      async cancel() {},
      async status() {
        return { status: "error", detail: "" };
      },
    };
    await upsertJob(root, {
      id: "failed-job",
      title: "Failed job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/failed-job",
      worktreePath: root,
      source: "prism",
      status: "error",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "2026-09-04T00:00:00.000Z",
      queuedAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: retryWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "failed-job",
      action: "retry",
    })) as { job: { status: string }; message: string };
    expect(result.job.status).toBe("error");
    expect(result.message).toMatch(/Could not retry/);
    expect(result.message).toMatch(/Cursor agent refused to launch/);
  });

  it("retry on a cancelled job starts a new teammate instead of staying cancelled", async () => {
    root = await tempRoot();
    let started = false;
    let resumed = false;
    let cancelled = false;
    const retryWorker: WorkerPort = {
      async start() {
        started = true;
        return { agentId: "agent-retry", pid: process.pid };
      },
      async resume() {
        resumed = true;
        return { pid: process.pid };
      },
      async cancel() {
        cancelled = true;
      },
      async status() {
        return { status: "cancelled", detail: "stopped" };
      },
    };
    const queuedAt = "2026-09-04T00:00:00.000Z";
    await upsertJob(root, {
      id: "cancelled-job",
      title: "Cancelled job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/cancelled-job",
      worktreePath: root,
      source: "prism",
      status: "cancelled",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      queuedAt,
      createdAt: queuedAt,
      updatedAt: queuedAt,
    });
    await writeRunState(root, "cancelled-job", {
      jobId: "cancelled-job",
      phase: "cancelled",
      lastActivity: "Cancelled",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      startedAt: queuedAt,
      updatedAt: "2026-09-04T00:01:00.000Z",
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: retryWorker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "cancelled-job",
      action: "retry",
    })) as {
      job: { status: string; id: string; parentJobId?: string };
      message: string;
    };
    expect(started).toBe(true);
    expect(resumed).toBe(false);
    expect(cancelled).toBe(false);
    expect(result.job.status).toBe("running");
    expect(result.job.parentJobId).toBe("cancelled-job");
    expect(result.job.id).not.toBe("cancelled-job");
    expect(result.message).toMatch(/Retried/i);
    await writeRunState(root, "cancelled-job", {
      jobId: "cancelled-job",
      pid: 99,
      phase: "cancelled",
      lastActivity: "Cancelled",
      resultSummary: "",
      errorMessage: "",
      gitSummary: "",
      startedAt: queuedAt,
      updatedAt: new Date().toISOString(),
    });
    const reaped = await reapJobs(root);
    expect(reaped.find((job) => job.id === "cancelled-job")?.status).toBe(
      "cancelled",
    );
    expect(reaped.find((job) => job.id === result.job.id)?.status).toBe(
      "running",
    );
  });

  it("reverify on a finished job without package.json records NA", async () => {
    root = await tempRoot();
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/done-job",
      worktreePath: root,
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    let started = false;
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: {
        async start() {
          started = true;
          return { agentId: "agent-test" };
        },
        async resume() {},
        async cancel() {},
        async status() {
          return { status: "running", detail: "agent-test" };
        },
      },
      env: { CURSOR_API_KEY: "test-key" },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as {
      job: {
        verification?: string;
        verificationDetail?: string;
        parentJobId?: string;
        id: string;
      };
      message: string;
    };
    expect(started).toBe(false);
    expect(result.job.parentJobId).toBe("done-job");
    expect(result.job.verification).toBe("skipped");
    expect(result.message).toMatch(/package\.json/i);
  });

  it("reverify actually runs checks again and survives a later reap", async () => {
    root = await tempRoot();
    let calls = 0;
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/done-job",
      worktreePath: "/missing-worktree",
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      lastActivity: "Checks failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await writeRunState(root, "done-job", {
      jobId: "done-job",
      phase: "done",
      lastActivity: "Checks failed",
      resultSummary: "1 file changed",
      errorMessage: "",
      gitSummary: "1 file changed",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      startedAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:01:00.000Z",
    });
    let started = false;
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: {
        async start() {
          started = true;
          return { agentId: "agent-test" };
        },
        async resume() {},
        async cancel() {},
        async status() {
          return { status: "running", detail: "agent-test" };
        },
      },
      env: { CURSOR_API_KEY: "test-key" },
      verifyWork: async () => {
        calls += 1;
        return { status: "passed", detail: "typecheck and test passed." };
      },
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as {
      job: {
        verification?: string;
        verificationDetail?: string;
        parentJobId?: string;
        id: string;
      };
      message: string;
    };
    expect(calls).toBe(1);
    expect(started).toBe(false);
    expect(result.job.verification).toBe("passed");
    expect(result.job.parentJobId).toBe("done-job");
    expect(result.message).toMatch(/typecheck and test passed/i);
    const reaped = await reapJobs(root);
    expect(reaped.find((job) => job.id === result.job.id)?.verification).toBe(
      "passed",
    );
    expect(reaped.find((job) => job.id === "done-job")?.verification).toBe(
      "failed",
    );
  });

  it("deferVerify returns before checks finish so the Console is not blocked", async () => {
    root = await tempRoot();
    let finishChecks: (value: {
      readonly status: "passed" | "failed" | "skipped";
      readonly detail: string;
    }) => void = () => undefined;
    const pendingChecks = new Promise<{
      readonly status: "passed" | "failed" | "skipped";
      readonly detail: string;
    }>((resolve) => {
      finishChecks = resolve;
    });
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/done-job",
      worktreePath: "/missing-worktree",
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      lastActivity: "Checks failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: {
        async start() {
          return { agentId: "agent-test" };
        },
        async resume() {},
        async cancel() {},
        async status() {
          return { status: "running", detail: "agent-test" };
        },
      },
      env: { CURSOR_API_KEY: "test-key" },
      deferVerify: true,
      verifyWork: () => pendingChecks,
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as {
      job: {
        lastActivity?: string;
        verification?: string;
        id: string;
        parentJobId?: string;
      };
      deferred?: boolean;
      message: string;
    };
    expect(result.deferred).toBe(true);
    expect(result.job.lastActivity).toBe("Running checks…");
    expect(result.job.verification).toBe("failed");
    expect(result.job.parentJobId).toBe("done-job");
    const childId = result.job.id;
    finishChecks({ status: "passed", detail: "typecheck and test passed." });
    for (let i = 0; i < 40; i++) {
      const listed = await loadJobs(root);
      if (listed.find((job) => job.id === childId)?.verification === "passed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(
      (await loadJobs(root)).find((job) => job.id === childId)?.verification,
    ).toBe("passed");
    expect(
      (await loadJobs(root)).find((job) => job.id === "done-job")?.verification,
    ).toBe("failed");
  });

  it("reverify starts a teammate when checks still fail", async () => {
    root = await tempRoot();
    let prompt = "";
    const retryWorker: WorkerPort = {
      async start(input) {
        prompt = input.prompt;
        return { agentId: "agent-fix", pid: 4400 };
      },
      async resume() {},
      async cancel() {},
      async status() {
        return { status: "running", detail: "agent-fix" };
      },
    };
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "Original brief about auth",
      branch: "dispatch/done-job",
      worktreePath: root,
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      lastActivity: "Checks failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: retryWorker,
      env: { CURSOR_API_KEY: "test-key" },
      verifyWork: async () => ({
        status: "failed",
        detail: "typecheck failed — error TS2345",
      }),
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as { job: { status: string; verification?: string }; message: string };
    expect(result.job.status).toBe("running");
    expect(result.job.verification).toBeUndefined();
    expect(result.message).toMatch(/teammate is fixing/i);
    expect(prompt).toContain(
      "Your only job is to make typecheck and tests pass",
    );
    expect(prompt).toContain("typecheck failed — error TS2345");
    expect(prompt.indexOf("typecheck failed")).toBeLessThan(
      prompt.indexOf("Original brief about auth"),
    );
  });

  it("reverify reports why the fix teammate failed to start", async () => {
    root = await tempRoot();
    const retryWorker: WorkerPort = {
      async start() {
        throw new Error("Cursor agent refused to launch");
      },
      async resume() {},
      async cancel() {},
      async status() {
        return { status: "error", detail: "" };
      },
    };
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/done-job",
      worktreePath: root,
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      lastActivity: "Checks failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: retryWorker,
      env: { CURSOR_API_KEY: "test-key" },
      verifyWork: async () => ({
        status: "failed",
        detail: "typecheck failed — error TS2345",
      }),
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as {
      job: { status: string; verification?: string; lastActivity?: string };
      message: string;
    };
    expect(result.job.status).toBe("done");
    expect(result.job.verification).toBe("failed");
    expect(result.job.lastActivity).toBe("Could not start a teammate");
    expect(result.message).toMatch(/Could not start a teammate/);
    expect(result.message).toMatch(/Cursor agent refused to launch/);
  });

  it("deferVerify starts a teammate after checks still fail", async () => {
    root = await tempRoot();
    let started = false;
    let finishChecks: (value: {
      readonly status: "passed" | "failed" | "skipped";
      readonly detail: string;
    }) => void = () => undefined;
    const pendingChecks = new Promise<{
      readonly status: "passed" | "failed" | "skipped";
      readonly detail: string;
    }>((resolve) => {
      finishChecks = resolve;
    });
    await upsertJob(root, {
      id: "done-job",
      title: "Done job",
      playbook: "ticket",
      prd: "",
      branch: "dispatch/done-job",
      worktreePath: root,
      source: "prism",
      status: "done",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
      lastActivity: "Checks failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker: {
        async start() {
          started = true;
          return { agentId: "agent-fix", pid: 4401 };
        },
        async resume() {},
        async cancel() {},
        async status() {
          return { status: "running", detail: "agent-fix" };
        },
      },
      env: { CURSOR_API_KEY: "test-key" },
      deferVerify: true,
      verifyWork: () => pendingChecks,
    });
    const result = (await runtime.handle("job_control", {
      jobId: "done-job",
      action: "reverify",
    })) as {
      job: {
        lastActivity?: string;
        status: string;
        id: string;
        parentJobId?: string;
      };
      deferred?: boolean;
      message: string;
    };
    expect(result.deferred).toBe(true);
    expect(result.job.parentJobId).toBe("done-job");
    expect(result.job.status).toBe("done");
    expect(started).toBe(false);
    expect(result.message).toMatch(/teammate will fix/i);
    const childId = result.job.id;
    finishChecks({
      status: "failed",
      detail: "typecheck failed — error TS2345",
    });
    for (let i = 0; i < 40; i++) {
      const listed = await loadJobs(root);
      if (listed.find((job) => job.id === childId)?.status === "running") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(
      (await loadJobs(root)).find((job) => job.id === childId)?.status,
    ).toBe("running");
    expect(
      (await loadJobs(root)).find((job) => job.id === "done-job")?.status,
    ).toBe("done");
    expect(started).toBe(true);
  });
});

describe("attach_context", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rmTree(root);
  });

  it("queues follow-up text on a live teammate for the next turn", async () => {
    root = await tempRoot();
    const worker: WorkerPort = {
      async start() {
        return { pid: 1 };
      },
      async resume() {
        throw new Error("should not resume a live teammate");
      },
      async cancel() {},
      async status() {
        return { status: "running", detail: "agent-test" };
      },
    };
    await upsertJob(root, {
      id: "live-job",
      title: "Live job",
      playbook: "ticket",
      prd: "Ship the gate.",
      branch: "dispatch/live-job",
      worktreePath: root,
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      workerPid: process.pid,
      cursorAgentId: "agent-live",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    const first = (await runtime.handle("job_control", {
      jobId: "live-job",
      action: "attach_context",
      context: "Also fix the flaky test.",
    })) as { job: { pendingContext?: string }; message: string };
    expect(first.message).toMatch(/Noted for/i);
    expect(first.job.pendingContext).toBe("Also fix the flaky test.");
    const second = (await runtime.handle("job_control", {
      jobId: "live-job",
      action: "attach_context",
      context: "And add a regression test.",
    })) as { job: { pendingContext?: string } };
    expect(second.job.pendingContext).toBe(
      "Also fix the flaky test.\n\nAnd add a regression test.",
    );
  });

  it("resumes a stopped teammate with the follow-up as the prompt", async () => {
    root = await tempRoot();
    let prompt = "";
    const worker: WorkerPort = {
      async start() {
        return { pid: 4400 };
      },
      async resume(input) {
        prompt = input.prompt ?? "";
        return { pid: 4400 };
      },
      async cancel() {},
      async status() {
        return { status: "running", detail: "agent-test" };
      },
    };
    await upsertJob(root, {
      id: "paused-run",
      title: "Paused run",
      playbook: "ticket",
      prd: "Ship the gate.",
      branch: "dispatch/paused-run",
      worktreePath: root,
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      cursorAgentId: "agent-paused",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      worker,
      env: { CURSOR_API_KEY: "test-key" },
    });
    await runtime.handle("job_control", {
      jobId: "paused-run",
      action: "attach_context",
      context: "Cover the empty state.",
    });
    expect(prompt).toBe("Cover the empty state.");
  });
});

describe("sleep and wake", () => {
  let root = "";
  let hub = "";
  afterEach(async () => {
    if (root) await rmTree(root);
    if (hub) await rmTree(hub);
  });

  function runningJob(): JobRecord {
    const now = new Date().toISOString();
    return {
      id: "fix-auth",
      title: "Fix auth",
      playbook: "ticket",
      prd: "Lock it down.",
      branch: "dispatch/fix-auth",
      worktreePath: root,
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  async function runtimeWithHub() {
    root = await tempRoot();
    hub = await mkdtemp(join(tmpdir(), "prism-hub-sleep-"));
    const cancelled: string[] = [];
    const runtime = createDispatchRuntime({
      workspaceRoot: root,
      git,
      env: { PRISM_HUB_HOME: hub, CURSOR_API_KEY: "k" },
      worker: {
        async start() {
          return { pid: process.pid };
        },
        async resume() {
          return { pid: process.pid };
        },
        async cancel(input) {
          if (input.jobId) cancelled.push(input.jobId);
        },
        async status() {
          return { status: "running", detail: "" };
        },
      },
    });
    return { runtime, cancelled };
  }

  it("sleeps immediately when nothing is running", async () => {
    const { runtime } = await runtimeWithHub();
    const result = (await runtime.handle("sleep", {})) as {
      asleep: boolean;
      message: string;
      needsConfirm?: boolean;
    };
    expect(result.needsConfirm).toBeUndefined();
    expect(result.asleep).toBe(true);
    expect(result.message).toMatch(/down/i);
  });

  it("asks before sleeping while a teammate is running", async () => {
    const { runtime, cancelled } = await runtimeWithHub();
    await upsertJob(root, runningJob());
    const asked = (await runtime.handle("sleep", {})) as {
      needsConfirm?: boolean;
    };
    expect(asked.needsConfirm).toBe(true);
    expect(cancelled).toEqual([]);

    const slept = (await runtime.handle("sleep", { confirm: true })) as {
      asleep: boolean;
      paused: number;
    };
    expect(slept.asleep).toBe(true);
    expect(slept.paused).toBe(1);
    expect(cancelled).toEqual(["fix-auth"]);
    const jobs = await loadJobs(root);
    expect(jobs[0]?.status).toBe("paused");
  });

  it("wakes and requeues jobs it paused", async () => {
    const { runtime } = await runtimeWithHub();
    await upsertJob(root, runningJob());
    await runtime.handle("sleep", { confirm: true });
    const woke = (await runtime.handle("wake", {})) as {
      asleep: boolean;
      resumed: number;
    };
    expect(woke.asleep).toBe(false);
    expect(woke.resumed).toBe(1);
    const jobs = await loadJobs(root);
    expect(jobs[0]?.status).toBe("queued");
  });

  it("wake is a no-op when already up", async () => {
    const { runtime } = await runtimeWithHub();
    const result = (await runtime.handle("wake", {})) as { message: string };
    expect(result.message).toMatch(/already up/i);
  });
});
