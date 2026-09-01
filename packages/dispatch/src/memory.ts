import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import {
  MemoryItemSchema,
  type MemoryItem,
  type MemoryScope,
} from "./types.js";
import { memoryPath, userMemoryPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type MemoryFile = { items: MemoryItem[] };

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadMemoryFile(path: string): Promise<MemoryItem[]> {
  const file = await readJsonFile<MemoryFile>(path, { items: [] });
  return (file.items ?? []).flatMap((item) => {
    const parsed = MemoryItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

async function saveMemoryFile(
  path: string,
  items: MemoryItem[],
): Promise<void> {
  await writeJsonFile(path, { items });
}

/**
 * Repo/job memories stay in the workspace. User-scoped memories live in
 * `~/.prism/dispatch/memory.json` so they follow the developer across
 * repos and MCP hosts (ADR-0047).
 */
export async function loadMemories(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MemoryItem[]> {
  const repoPath = memoryPath(workspaceRoot);
  const userPath = userMemoryPath(workspaceRoot, env);
  const repo = await loadMemoryFile(repoPath);
  if (!(await pathExists(userPath))) {
    const migrated = repo.filter((item) => item.scope === "user");
    if (migrated.length > 0) {
      await saveMemoryFile(userPath, migrated);
      await saveMemoryFile(
        repoPath,
        repo.filter((item) => item.scope !== "user"),
      );
    }
  }
  const user = await loadMemoryFile(userPath);
  const repoNow = await loadMemoryFile(repoPath);
  return [...user, ...repoNow.filter((item) => item.scope !== "user")];
}

export async function remember(input: {
  readonly workspaceRoot: string;
  readonly text: string;
  readonly scope: MemoryScope;
  readonly jobId?: string;
  readonly source?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<MemoryItem> {
  const env = input.env ?? process.env;
  const item: MemoryItem = {
    id: randomUUID(),
    scope: input.scope,
    text: input.text.trim(),
    source: input.source ?? "user",
    createdAt: new Date().toISOString(),
    ...(input.jobId ? { jobId: input.jobId } : {}),
  };
  if (input.scope === "user") {
    const path = userMemoryPath(input.workspaceRoot, env);
    const items = await loadMemoryFile(path);
    items.push(item);
    await saveMemoryFile(path, items);
    return item;
  }
  const path = memoryPath(input.workspaceRoot);
  const items = await loadMemoryFile(path);
  items.push(item);
  await saveMemoryFile(path, items);
  return item;
}

export async function forgetMemory(
  workspaceRoot: string,
  idOrText: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const needle = idOrText.trim().toLowerCase();
  const matches = (item: MemoryItem): boolean =>
    item.id !== idOrText && !item.text.toLowerCase().includes(needle);

  const repoPath = memoryPath(workspaceRoot);
  const userPath = userMemoryPath(workspaceRoot, env);
  const repo = await loadMemoryFile(repoPath);
  const user = await loadMemoryFile(userPath);
  const nextRepo = repo.filter(matches);
  const nextUser = user.filter(matches);
  const removed =
    repo.length - nextRepo.length + (user.length - nextUser.length);
  if (removed > 0) {
    await saveMemoryFile(repoPath, nextRepo);
    await saveMemoryFile(userPath, nextUser);
  }
  return removed;
}

export function memoriesForJob(
  items: readonly MemoryItem[],
  jobId?: string,
): MemoryItem[] {
  return items.filter(
    (item) =>
      item.scope === "repo" ||
      item.scope === "user" ||
      (item.scope === "job" && jobId !== undefined && item.jobId === jobId),
  );
}

export function formatMemoriesForPrompt(items: readonly MemoryItem[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- (${item.scope}) ${item.text}`).join("\n");
}
