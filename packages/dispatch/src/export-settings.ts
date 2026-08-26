import { loadConfig } from "./config.js";
import { loadMemories } from "./memory.js";
import type { DispatchConfig, MemoryItem } from "./types.js";

export type ExportedSettings = {
  readonly config: DispatchConfig;
  readonly slackTrackChannelIds: readonly string[];
  readonly memories: readonly Pick<MemoryItem, "scope" | "text">[];
};

/**
 * Non-secret template for sharing standup prefs. Tokens and job paths stay out.
 */
export async function exportSettings(
  workspaceRoot: string,
  includeMemories: boolean,
): Promise<ExportedSettings> {
  const config = await loadConfig(workspaceRoot);
  const memories = includeMemories ? await loadMemories(workspaceRoot) : [];
  return {
    config,
    slackTrackChannelIds: config.slackTrackChannelIds,
    memories: memories
      .filter((item) => item.source === "user")
      .map((item) => ({ scope: item.scope, text: item.text })),
  };
}
