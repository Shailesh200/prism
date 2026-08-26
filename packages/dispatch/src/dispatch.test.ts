import { describe, expect, it } from "vitest";
import { visibleDispatchTools, WORKER_HIDDEN_TOOLS } from "./runtime.js";
import { connectCta } from "./drivers.js";
import {
  createPkce,
  buildAuthorizeUrl,
  OAUTH_PROVIDERS,
  DISPATCH_OAUTH_REDIRECT_URI,
  waitForLoopbackCode,
} from "./oauth.js";
import { parseDriverId } from "./types.js";
import { workerPrompt } from "./worker.js";
import type { JobRecord } from "./types.js";

describe("worker tool filter", () => {
  it("omits start_job and start_my_day when PRISM_DISPATCH_ROLE=worker", () => {
    const names = visibleDispatchTools({ PRISM_DISPATCH_ROLE: "worker" });
    expect(names).not.toContain("start_job");
    expect(names).not.toContain("start_my_day");
    expect(names).not.toContain("init");
    expect(WORKER_HIDDEN_TOOLS).toEqual(["start_my_day", "init", "start_job"]);
    expect(names).toContain("list_jobs");
    expect(names).toContain("remember");
  });

  it("exposes the full pack on the host", () => {
    expect(visibleDispatchTools({}).length).toBe(9);
  });
});

describe("oauth helpers", () => {
  it("builds a GitHub authorize URL with PKCE", () => {
    const pkce = createPkce();
    expect(pkce.verifier.length).toBeGreaterThan(20);
    const url = buildAuthorizeUrl({
      provider: OAUTH_PROVIDERS.github,
      clientId: "abc",
      redirectUri: "http://127.0.0.1:9/callback",
      state: "s",
      challenge: pkce.challenge,
    });
    expect(url).toContain("github.com");
    expect(url).toContain("code_challenge");
  });

  it("uses user_scope for Slack so the app stays private and read-only", () => {
    const url = buildAuthorizeUrl({
      provider: OAUTH_PROVIDERS.slack,
      clientId: "slack-app",
      redirectUri: "http://127.0.0.1:9/callback",
      state: "s",
    });
    expect(url).toContain("user_scope=");
    expect(url).toContain("search%3Aread");
    expect(url).not.toContain("chat:write");
  });
});

describe("worker prompt", () => {
  it("tells the worker not to install or recurse", () => {
    const job: JobRecord = {
      id: "J1",
      title: "Fix auth",
      playbook: "ticket",
      prd: "Do not leak tokens",
      branch: "feat/j1",
      worktreePath: "/tmp/j1",
      source: "prism",
      status: "running",
      lastStep: "",
      nextStep: "",
      waitingOn: "",
      createdAt: "t",
      updatedAt: "t",
    };
    const text = workerPrompt({
      job,
      memories: [
        {
          id: "m",
          scope: "repo",
          text: "Prefer existing auth helpers",
          source: "user",
          createdAt: "t",
        },
      ],
    });
    expect(text).toContain("bun install");
    expect(text).toContain("no shell");
    expect(text).toContain("Do not start new Dispatch jobs");
    expect(text).toContain("Prefer existing auth helpers");
  });
});

describe("connect CTAs", () => {
  it("names each driver in a sentence the agent can speak", () => {
    expect(connectCta("linear")).toMatch(/Linear/);
    expect(connectCta("google-calendar")).toMatch(/Google Calendar/);
  });
});

describe("driver aliases", () => {
  it("maps chat phrasing onto canonical ids", () => {
    expect(parseDriverId("google calendar")).toBe("google-calendar");
    expect(parseDriverId("Google Calendar")).toBe("google-calendar");
    expect(parseDriverId("gcal")).toBe("google-calendar");
    expect(parseDriverId("gh")).toBe("github");
    expect(parseDriverId("linear")).toBe("linear");
    expect(parseDriverId("not-a-driver")).toBeUndefined();
  });
});

describe("oauth loopback", () => {
  it("advertises a stable redirect URI for vendor consoles", () => {
    expect(DISPATCH_OAUTH_REDIRECT_URI).toBe("http://127.0.0.1:8765/callback");
  });

  it("accepts the callback on a chosen loopback port", async () => {
    const loopback = await waitForLoopbackCode({
      timeoutMs: 5_000,
      preferredPort: 0,
    });
    const response = await fetch(`${loopback.redirectUri}?code=abc&state=s`);
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain("Prism Dispatch is connected");
    expect(html).toContain("#00c2c2");
    const result = await loopback.done;
    expect(result.code).toBe("abc");
    expect(result.state).toBe("s");
  });

  it("cancels the loopback when the host aborts Authenticate", async () => {
    const abort = new AbortController();
    const loopback = await waitForLoopbackCode({
      timeoutMs: 5_000,
      preferredPort: 0,
      signal: abort.signal,
    });
    abort.abort();
    await expect(loopback.done).rejects.toThrow(/cancelled/i);
  });
});
