import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntelligencePlane } from "./intelligence.js";
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

  it("serves the Console planes: dated jobs, repos, and a lazy /api/host", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    temps.push(home, repo);
    const started = await startHub({
      env: { PRISM_HUB_HOME: home, PRISM_HUB_PORT: "0", PRISM_HUB: "1" },
      idleMs: 60_000,
      pollMs: 200,
      // A stub stands in for Core: loading the real engine here would make
      // this a slow integration test of the indexer, not of the plane.
      intelligence: createIntelligencePlane({
        load: async () => ({
          createSession: () =>
            ({
              open: async () => ({ ok: true as const, value: undefined }),
              close: () => {},
            }) as never,
          dispatch: async (_session, request) => ({
            id: request.id,
            ok: true as const,
            value: { stub: true },
          }),
        }),
      }),
    });
    if ("alreadyRunning" in started) throw new Error("expected a fresh hub");
    closers.push(started.close);
    const { port, token } = started.record;
    const auth = { Authorization: `Bearer ${token}` };
    const json = { ...auth, "Content-Type": "application/json" };

    const branded = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      headers: { ...auth, Origin: `http://local.prismhq.in:${port}` },
    });
    expect(branded.status).toBe(200);

    // `prismhq.localhost` is loopback by RFC 6761, so the Console must accept it
    // as an origin or the friendly hostname is unusable (ADR-0048).
    const friendly = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      headers: { ...auth, Origin: `http://prismhq.localhost:${port}` },
    });
    expect(friendly.status).toBe(200);

    // Core must not be loaded merely because the daemon is up.
    const cold = (await (
      await fetch(`http://127.0.0.1:${port}/api/healthz`, { headers: auth })
    ).json()) as { version: string; intelligence: { loaded: boolean } };
    expect(cold.intelligence.loaded).toBe(false);
    expect(cold.version).not.toBe("unknown");

    await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ path: repo }),
    });
    await writeJob(repo, "running");
    await waitFor(async () => {
      const body = (await (
        await fetch(`http://127.0.0.1:${port}/api/jobs`, { headers: auth })
      ).json()) as { jobs: JobSnapshot[] };
      return body.jobs.length > 0;
    });

    // Every list the UI renders must say when it was read.
    const jobs = (await (
      await fetch(`http://127.0.0.1:${port}/api/jobs`, { headers: auth })
    ).json()) as { jobs: JobSnapshot[]; asOf: string; errors: unknown[] };
    expect(Number.isFinite(Date.parse(jobs.asOf))).toBe(true);
    expect(jobs.errors).toEqual([]);

    const repos = (await (
      await fetch(`http://127.0.0.1:${port}/api/repos`, { headers: auth })
    ).json()) as { repos: { path: string; jobCount: number }[] };
    expect(repos.repos.map((row) => row.path)).toContain(repo);
    expect(repos.repos.find((row) => row.path === repo)?.jobCount).toBe(1);

    // An unknown method is refused at the edge rather than cast and dispatched.
    const bogus = await fetch(`http://127.0.0.1:${port}/api/host`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: "1", method: "drop-tables" }),
    });
    expect(bogus.status).toBe(400);

    const answer = await fetch(`http://127.0.0.1:${port}/api/host`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: "2", method: "dashboard", workspace: repo }),
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ id: "2", ok: true });

    const warm = (await (
      await fetch(`http://127.0.0.1:${port}/api/healthz`, { headers: auth })
    ).json()) as {
      intelligence: { loaded: boolean; workspace: string | null };
    };
    expect(warm.intelligence.loaded).toBe(true);
    expect(warm.intelligence.workspace).toBe(repo);
  }, 15_000);

  it("removes a job from GET /api/jobs after delete", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    temps.push(home, repo);
    const started = await startHub({
      env: {
        PRISM_HUB_HOME: home,
        PRISM_HUB_PORT: "0",
        PRISM_HUB: "1",
      },
      idleMs: 60_000,
      pollMs: 200,
      control: async (workspace, _jobId, action) => {
        if (action === "delete") {
          await writeFile(
            join(workspace, ".prism", "dispatch", "jobs.json"),
            `${JSON.stringify({ jobs: [] })}\n`,
          );
          return { deleted: true };
        }
        return { ok: true };
      },
    });
    if ("alreadyRunning" in started) throw new Error("expected a fresh hub");
    closers.push(started.close);
    const port = started.record.port;
    const token = started.record.token;
    const auth = { Authorization: `Bearer ${token}` };
    await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ path: repo }),
    });
    await writeJob(repo, "done");
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
        headers: auth,
      });
      const body = (await response.json()) as { jobs: JobSnapshot[] };
      return body.jobs.some((job) => job.id === "news-tab");
    });
    const deleted = await fetch(
      `http://127.0.0.1:${port}/api/jobs/news-tab/control`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", workspace: repo }),
      },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ deleted: true });
    const list = (await (
      await fetch(`http://127.0.0.1:${port}/api/jobs`, { headers: auth })
    ).json()) as { jobs: JobSnapshot[] };
    expect(list.jobs).toEqual([]);
  });

  it("reads and writes Dispatch settings for a workspace", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    temps.push(home, repo);
    const started = await startHub({
      env: {
        PRISM_HUB_HOME: home,
        PRISM_HUB_PORT: "0",
        PRISM_HUB: "1",
      },
      idleMs: 60_000,
      pollMs: 5_000,
    });
    if ("alreadyRunning" in started) throw new Error("expected a fresh hub");
    closers.push(started.close);
    const port = started.record.port;
    const token = started.record.token;
    const auth = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ path: repo }),
    });
    const got = await fetch(
      `http://127.0.0.1:${port}/api/settings?workspace=${encodeURIComponent(repo)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(got.status).toBe(200);
    const saved = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        workspace: repo,
        maxJobs: 2,
        placement: "worktree",
      }),
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      config: { maxJobs: number; placement: string };
    };
    expect(body.config.maxJobs).toBe(2);
    expect(body.config.placement).toBe("worktree");
    const onDisk = JSON.parse(
      await readFile(join(repo, ".prism/dispatch/config.json"), "utf8"),
    ) as { maxJobs: number; placement: string };
    expect(onDisk.maxJobs).toBe(2);
    expect(onDisk.placement).toBe("worktree");
    const reread = await fetch(
      `http://127.0.0.1:${port}/api/settings?workspace=${encodeURIComponent(repo)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const again = (await reread.json()) as {
      config: { maxJobs: number; placement: string };
    };
    expect(again.config.maxJobs).toBe(2);
    expect(again.config.placement).toBe("worktree");
  });

  it("reuses the hub token across restarts and sets a session cookie", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const assets = await mkdtemp(join(tmpdir(), "prism-hub-assets-"));
    temps.push(home, assets);
    await writeFile(
      join(assets, "index.html"),
      "<!doctype html><title>ok</title>",
    );
    const env = {
      PRISM_HUB_HOME: home,
      PRISM_HUB_PORT: "0",
      PRISM_HUB: "1",
    };
    const first = await startHub({
      env,
      assetsDir: assets,
      idleMs: 60_000,
      pollMs: 5_000,
    });
    if ("alreadyRunning" in first) throw new Error("expected a fresh hub");
    const token = first.record.token;
    await first.close();
    const second = await startHub({
      env,
      assetsDir: assets,
      idleMs: 60_000,
      pollMs: 5_000,
    });
    if ("alreadyRunning" in second) throw new Error("expected a restarted hub");
    closers.push(second.close);
    expect(second.record.token).toBe(token);
    const page = await fetch(
      `http://127.0.0.1:${second.record.port}/?token=${encodeURIComponent(token)}`,
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie") ?? "").toMatch(/prism_hub=/);
  });

  it("serves a job notes file and rejects path traversal", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-home-"));
    const repo = await mkdtemp(join(tmpdir(), "prism-hub-repo-"));
    temps.push(home, repo);
    await mkdir(join(repo, ".prism/dispatch/notes"), { recursive: true });
    await writeFile(
      join(repo, ".prism/dispatch/notes/audit.md"),
      "full findings\n",
    );
    await writeJob(repo, "done");
    const started = await startHub({
      env: { PRISM_HUB_HOME: home, PRISM_HUB_PORT: "0", PRISM_HUB: "1" },
      idleMs: 60_000,
      pollMs: 200,
    });
    if ("alreadyRunning" in started) throw new Error("expected a fresh hub");
    closers.push(started.close);
    const { port, token } = started.record;
    const auth = { Authorization: `Bearer ${token}` };
    await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ path: repo }),
    });
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
        headers: auth,
      });
      const body = (await response.json()) as { jobs: JobSnapshot[] };
      return body.jobs.some((job) => job.id === "news-tab");
    });
    const listed = await fetch(
      `http://127.0.0.1:${port}/api/jobs/news-tab/notes?workspace=${encodeURIComponent(repo)}&path=${encodeURIComponent(".prism/dispatch/notes/audit.md")}`,
      { headers: auth },
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      path: ".prism/dispatch/notes/audit.md",
      text: "full findings\n",
    });
    const blocked = await fetch(
      `http://127.0.0.1:${port}/api/jobs/news-tab/notes?workspace=${encodeURIComponent(repo)}&path=${encodeURIComponent(".prism/dispatch/notes/../jobs.json")}`,
      { headers: auth },
    );
    expect(blocked.status).toBe(404);
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
