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
import { appendRunLog, lifecycleLogEntry } from "./run-log.js";

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
    if (root) await rm(root, { recursive: true, force: true });
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
    root = await tempRoot();
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
      lifecycleLogEntry(
        "thinking",
        "fresh",
        new Date("2026-01-01T00:01:00.000Z"),
      ),
    );

    const runtime = createDispatchRuntime({
      workspaceRoot: root,
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
