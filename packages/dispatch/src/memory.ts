import { randomUUID } from "node:crypto";
import {
  MemoryItemSchema,
  type MemoryItem,
  type MemoryScope,
} from "./types.js";
import { memoryPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type MemoryFile = { items: MemoryItem[] };

export async function loadMemories(
  workspaceRoot: string,
): Promise<MemoryItem[]> {
  const file = await readJsonFile<MemoryFile>(memoryPath(workspaceRoot), {
    items: [],
  });
  return (file.items ?? []).flatMap((item) => {
    const parsed = MemoryItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

async function saveMemories(
  workspaceRoot: string,
  items: MemoryItem[],
): Promise<void> {
  await writeJsonFile(memoryPath(workspaceRoot), { items });
}

export async function remember(input: {
  readonly workspaceRoot: string;
  readonly text: string;
  readonly scope: MemoryScope;
  readonly jobId?: string;
  readonly source?: string;
}): Promise<MemoryItem> {
  const item: MemoryItem = {
    id: randomUUID(),
    scope: input.scope,
    text: input.text.trim(),
    source: input.source ?? "user",
    createdAt: new Date().toISOString(),
    ...(input.jobId ? { jobId: input.jobId } : {}),
  };
  const items = await loadMemories(input.workspaceRoot);
  items.push(item);
  await saveMemories(input.workspaceRoot, items);
  return item;
}

export async function forgetMemory(
  workspaceRoot: string,
  idOrText: string,
): Promise<number> {
  const needle = idOrText.trim().toLowerCase();
  const items = await loadMemories(workspaceRoot);
  const next = items.filter(
    (item) => item.id !== idOrText && !item.text.toLowerCase().includes(needle),
  );
  const removed = items.length - next.length;
  if (removed > 0) await saveMemories(workspaceRoot, next);
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
