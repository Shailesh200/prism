import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startHub } from "./server.js";
import type { JobSnapshot } from "./types.js";

const temps: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function writeJob(
  root: string,
  status: "running" | "done",
): Promise<void> {
  const dispatch = join(root, ".prism", "dispatch");
  await mkdir(join(dispatch, "runs"), { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    join(dispatch, "jobs.json"),
    `${JSON.stringify({
      jobs: [
        {
          id: "news-tab",
          title: "news-tab",
          branch: "dispatch/news-tab",
          worktreePath: join(root, ".prism/dispatch/worktrees/news-tab"),
          source: "prism",
          status,
          lastActivity: status === "done" ? "Done" : "Editing files",
          resultSummary: status === "done" ? "Checks passed." : undefined,
          createdAt: now,
          updatedAt: now,
        },
      ],
    })}\n`,
  );
}

describe("hub HTTP", () => {
  it("rejects a foreign origin and a missing token, then streams job.finished", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    temps.push(home, repo);
    const notices: string[] = [];
    const started = await startHub({
      env: {
        PRISM_HUB_HOME: home,
        PRISM_HUB_PORT: "0",
        PRISM_HUB: "1",
      },
      idleMs: 60_000,
      pollMs: 200,
      notify: async (copy) => {
        notices.push(`${copy.title} ${copy.body}`);
      },
      control: async () => ({ ok: true }),
    });
    if ("alreadyRunning" in started) {
      throw new Error("expected a fresh hub");
    }
    closers.push(started.close);
    const port = started.record.port;
    const token = started.record.token;
    const origin = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "https://evil.example",
      },
    });
    expect(origin.status).toBe(403);

    const unauth = await fetch(`http://127.0.0.1:${port}/api/jobs`);
    expect(unauth.status).toBe(401);

    await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: repo }),
    });

    await writeJob(repo, "running");
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as { jobs: JobSnapshot[] };
      return body.jobs.some((job) => job.id === "news-tab");
    });

    const events: string[] = [];
    const stream = await fetch(
      `http://127.0.0.1:${port}/api/events?token=${encodeURIComponent(token)}`,
    );
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("missing SSE body");
    const consume = (async () => {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        events.push(decoder.decode(value));
        if (events.join("").includes("job.finished")) break;
      }
    })();

    await writeJob(repo, "done");
    await Promise.race([
      consume,
      sleep(4_000).then(() => {
        throw new Error(`no job.finished in SSE: ${events.join("")}`);
      }),
    ]);
    expect(events.join("")).toMatch(/job\.finished/);
    expect(notices.some((line) => /news-tab finished/.test(line))).toBe(true);
  }, 15_000);
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await sleep(100);
  }
  throw new Error("timed out waiting for jobs");
}
