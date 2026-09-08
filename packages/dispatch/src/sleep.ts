/**
 * Machine-wide Prism sleep (Console down page + frozen job drain).
 *
 * Lives in Dispatch so the queue can read it without importing the hub.
 * The file sits next to `hub.json` under `PRISM_HUB_HOME` / `~/.prism/hub`.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export type SleptJob = {
  readonly workspaceRoot: string;
  readonly jobId: string;
};

export type SleepState = {
  readonly asleep: boolean;
  readonly at?: string;
  readonly paused?: readonly SleptJob[];
};

function prismHubHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_HUB_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".prism", "hub");
}

export function sleepStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHubHome(env), "sleep.json");
}

export async function readSleepState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SleepState> {
  return readJsonFile<SleepState>(sleepStatePath(env), { asleep: false });
}

export async function isPrismAsleep(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const state = await readSleepState(env);
  return state.asleep === true;
}

/** Sync read for the hub idle timer, which cannot await. */
export function isPrismAsleepSync(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const raw = JSON.parse(readFileSync(sleepStatePath(env), "utf8")) as {
      asleep?: unknown;
    };
    return raw.asleep === true;
  } catch {
    return false;
  }
}

export async function putPrismToSleep(
  env: NodeJS.ProcessEnv,
  paused: readonly SleptJob[] = [],
): Promise<SleepState> {
  const state: SleepState = {
    asleep: true,
    at: new Date().toISOString(),
    ...(paused.length > 0 ? { paused } : {}),
  };
  await writeJsonFile(sleepStatePath(env), state);
  return state;
}

export async function wakePrism(
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly SleptJob[]> {
  const previous = await readSleepState(env);
  const paused = previous.asleep === true ? (previous.paused ?? []) : [];
  await unlink(sleepStatePath(env)).catch(() => {});
  return paused;
}

export function asleepPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prism is down</title>
  <style>
    :root {
      --prism-brand: #00c2c2;
      --prism-canvas: #0a0e1a;
      --prism-ink: #e6f0f2;
      --prism-muted: #94a3b8;
      --prism-raised: #131926;
      --prism-font: Inter, "Segoe UI", system-ui, sans-serif;
      --prism-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--prism-canvas);
      color: var(--prism-ink);
      font-family: var(--prism-font);
    }
    main { text-align: center; padding: 32px 24px; max-width: 32rem; }
    .eyebrow {
      font-family: var(--prism-mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--prism-brand);
      margin: 0 0 12px;
    }
    h1 {
      font-size: 2rem;
      font-weight: 600;
      letter-spacing: -0.03em;
      margin: 0 0 16px;
    }
    p { color: var(--prism-muted); line-height: 1.55; margin: 0 0 12px; }
    code {
      font-family: var(--prism-mono);
      font-size: 0.95rem;
      color: var(--prism-brand);
      background: var(--prism-raised);
      padding: 6px 12px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Prism</p>
    <h1>Prism is down</h1>
    <p>Queued jobs are sleeping. In chat, say</p>
    <p><code>prism wake</code></p>
    <p>to bring the Console back.</p>
  </main>
</body>
</html>
`;
}

export async function listedWorkspaceRoots(
  env: NodeJS.ProcessEnv,
  current: string,
): Promise<string[]> {
  const roots = new Set<string>();
  const trimmed = current.trim();
  if (trimmed) roots.add(trimmed);
  const file = await readJsonFile<{
    workspaces?: readonly { path?: string }[];
  }>(join(prismHubHome(env), "registry.json"), {});
  for (const row of file.workspaces ?? []) {
    const path = row.path?.trim();
    if (path) roots.add(path);
  }
  return [...roots];
}

export function isInProcessJobStatus(status: string): boolean {
  return status === "booting" || status === "running" || status === "ready";
}
