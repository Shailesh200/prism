/**
 * What the prompt-submit hook adds to a prompt (ADR-0065, round 2), built in
 * one place for the warm daemon (`/v1/prompt`) and the daemon-off path.
 *
 * A change prompt gets Prepare's short block (shared `buildPromptPack`).
 * Files the block shows go into the session store (P4), so a follow-up prompt
 * gets only what is new and the stop line can say how many files Prism
 * remembered. The lens and the session memory are the hook's own part
 * (`@repo-prism/shared/prompt-hook`): they need no index.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import { writeLastPrepareChange } from "@repo-prism/core/prepare-history";
import {
  AUTO_PREPARE_BUDGET,
  buildPromptPack,
  classifyPrompt,
  ok,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { recordEvent } from "@repo-prism/shared/events";
import type {
  PromptContext,
  PromptContextRequest,
} from "@repo-prism/shared/prompt-hook";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { contentKey, readSessionStore } from "@repo-prism/shared/session-store";

export {
  markLiteSession,
  markSessionOnce,
  promptLens,
  rememberShown,
  type PromptContext,
  type PromptContextRequest,
} from "@repo-prism/shared/prompt-hook";

/** Paths this session already showed the agent (P4 session store). */
function surfacedFiles(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv,
): Set<string> {
  if (!sessionId) return new Set();
  const store = readSessionStore(sessionId, env);
  return new Set(
    Object.entries(store.sent)
      .filter(([, entry]) => entry.kind === "file")
      .map(([path]) => path),
  );
}

/**
 * This session's pack, for the pre-edit hook's outside-pack note (R-C5).
 * Keyed by session so two sessions never share one.
 */
function writeSessionPack(
  root: string,
  sessionId: string,
  paths: readonly string[],
  env: NodeJS.ProcessEnv,
): void {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
  const path = join(
    workspacePrismDir(root, env),
    "hooks",
    "packs",
    `${key}.json`,
  );
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        sessionId,
        generatedAt: new Date().toISOString(),
        packFiles: paths.map((p) => ({ path: p })),
      }),
    );
  } catch (error) {
    recordEvent(
      {
        event: "prompt.session_pack",
        outcome: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        workspace: root,
      },
      { env },
    );
  }
}

function degraded(
  event: string,
  error: unknown,
  root: string,
  env: NodeJS.ProcessEnv,
): void {
  recordEvent(
    {
      event,
      outcome: "degraded",
      reason: error instanceof Error ? error.message : String(error),
      workspace: root,
    },
    { env },
  );
}

export async function promptContext(
  workspace: PrismWorkspace,
  request: PromptContextRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<PromptContext, PrismError>> {
  const root = workspace.rootPath;
  const prompt = request.prompt;
  const sessionId = request.sessionId || undefined;
  const kind = classifyPrompt(prompt).kind;
  if (kind !== "change") {
    return ok({
      text: null,
      reason: `not a change request (${kind})`,
      files: 0,
      named: false,
    });
  }

  const prepared = await workspace.prepareChange({
    task: prompt.slice(0, 400),
    budget: AUTO_PREPARE_BUDGET,
  });
  if (!prepared.ok) return prepared;
  const prep = prepared.value;
  await writeLastPrepareChange(root, prep, env).catch((error: unknown) =>
    degraded("prompt.last_prepare", error, root, env),
  );
  const surfaced = surfacedFiles(sessionId, env);
  const pack = buildPromptPack({ prep, prompt, surfaced });

  const hashes = new Map<string, string>();
  if (sessionId && pack.shown.length > 0) {
    const index = workspace.getIndex();
    if (index.ok) {
      for (const f of index.value.files)
        if (f.contentHash) hashes.set(f.path, f.contentHash);
    }
  }
  const shown = pack.shown.map((file) => ({
    path: file.path,
    hash: hashes.get(file.path)?.slice(0, 16) ?? contentKey(file.path),
  }));
  if (sessionId) {
    writeSessionPack(
      root,
      sessionId,
      // Every file shown this session: the pre-edit "outside pack" note.
      [...new Set([...surfaced, ...pack.shown.map((f) => f.path)])],
      env,
    );
  }
  return ok({
    text: pack.text,
    reason: pack.reason,
    files: pack.shown.length,
    named: pack.named,
    shown,
    summary: pack.summary,
  });
}
