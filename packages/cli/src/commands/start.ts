/**
 * `prism start` (plan P19): from nothing to a first answer in one command.
 * Detects the coding agents on this machine, installs Prism for each from
 * this local build, indexes the repository and prints the top of the repo
 * map with what to try next. A bare `prism` prints the same answer without
 * installing anything.
 *
 * Large repos answer from a partial (package-first) index; the daemon finishes
 * the full index in the background.
 */
import { homedir } from "node:os";
import { Prism } from "@repo-prism/core";
import { ensureDaemon, warmDaemonWorkspace } from "@repo-prism/daemon";
import { daemonLaunch } from "./graph.js";
import {
  err,
  ok,
  partialIndexOf,
  PrismErrorCode,
  prismError,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { detectHosts } from "../install/hosts.js";
import type { CommandContext, CommandHandler } from "../runtime.js";
import { wrap } from "../table.js";
import {
  backupLines,
  defaultLayout,
  HOST_NAMES,
  runInstall,
} from "./install.js";

/** Enough of the map to orient: the few most-imported files and their exports. */
export const START_MAP_TOKENS = 600;

/**
 * Soft cap for the first answer. Repos at or under this are indexed fully in
 * process; larger ones get a package-first partial and a background finish.
 *
 * Was 500, which left CardWise (900 code files) on a partial index whenever the
 * daemon could not finish it (round 4). Measured on this machine with a cold
 * cache: Prism's own 689 files in 0.54 s, a synthetic 3,000 in 0.93 s and
 * 10,000 in 3.1 s, peak RSS 140 to 190 MB with no growth by file count. 5,000
 * keeps the first answer at a couple of seconds and indexes nearly every repo
 * whole. `PRISM_START_FILE_CAP` lowers or raises it (0 = no cap).
 */
export const FIRST_ANSWER_FILE_CAP = 5000;

/** The cap `prism start` uses: `PRISM_START_FILE_CAP` when it is a whole number. */
export function firstAnswerCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PRISM_START_FILE_CAP?.trim();
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return FIRST_ANSWER_FILE_CAP;
}

export const TRY_LINE =
  'Try: prism prepare "<task>", or ask your agent to call prepare_change before it edits.';

export const PARTIAL_LINE =
  "Partial map (top packages first); the full index is finishing in the background.";

export type FirstAnswer = {
  readonly files: number;
  readonly elapsedMs: number;
  readonly map: string;
  readonly partial: boolean;
};

/** `partialNote` replaces {@link PARTIAL_LINE} when the background finish did not start. */
export function firstAnswerText(
  answer: FirstAnswer,
  partialNote = PARTIAL_LINE,
): string {
  const seconds = (answer.elapsedMs / 1000).toFixed(1);
  const lines = [
    `Indexed ${answer.files} code files in ${seconds} s.`,
    "",
    answer.map,
    "",
  ];
  if (answer.partial) lines.push(partialNote, "");
  lines.push(TRY_LINE);
  return lines.join("\n");
}

/** Null when the daemon took the full index; otherwise the line to print. */
async function finishFullIndexInBackground(
  root: string,
  progress: (message: string) => void,
): Promise<string | null> {
  const env = process.env;
  const finish =
    "Partial map (top packages first). Run `prism index` to finish";
  if (env.PRISM_DAEMON === "0") {
    return `${finish} the full index (the daemon is off).`;
  }
  const launch = daemonLaunch(env);
  if (typeof launch === "string") return `${finish}: ${launch}`;
  progress("Starting daemon to finish the full index…");
  const daemonEnv = { ...env, PRISM_DAEMON: "1" };
  const build = launch.buildId ? { buildId: launch.buildId } : {};
  const started = await ensureDaemon({
    ...launch,
    env: daemonEnv,
    waitMs: 10_000,
  });
  if (started.kind !== "ok") return `${finish} the full index.`;
  await warmDaemonWorkspace({ root, env: daemonEnv, ...build });
  return null;
}

async function firstAnswer(
  context: CommandContext,
): Promise<Result<FirstAnswer, PrismError>> {
  const started = performance.now();
  const opened = Prism.create().openRepository(context.workspace.path);
  if (!opened.ok) return opened;
  context.progress(`Indexing ${context.workspace.path} …`);
  const indexed = await opened.value.index({
    maxAnalyzeFiles: firstAnswerCap(),
    ...(typeof context.options.maxFileBytes === "number"
      ? { maxFileBytes: context.options.maxFileBytes }
      : {}),
    ...(context.options.excludeGlobs?.length
      ? { extraIgnorePatterns: context.options.excludeGlobs }
      : {}),
  });
  if (!indexed.ok) {
    opened.value.close();
    return indexed;
  }
  const partial = partialIndexOf(indexed.value.warnings) !== null;
  const map = opened.value.repoMap({ maxTokens: START_MAP_TOKENS });
  if (!map.ok) {
    opened.value.close();
    return map;
  }
  // Keep the workspace open only for the map; start exits after this command.
  opened.value.close();
  return ok({
    files: indexed.value.stats.filesIndexed,
    elapsedMs: Math.round(performance.now() - started),
    map: map.value.text.trimEnd(),
    partial,
  });
}

/** Index, answer, and finish a partial index: the same text for `start` and bare `prism`. */
async function answerWithMap(
  context: CommandContext,
): Promise<Result<{ answer: FirstAnswer; text: string }, PrismError>> {
  const first = await firstAnswer(context);
  if (!first.ok) return first;
  const note = first.value.partial
    ? await finishFullIndexInBackground(
        context.workspace.path,
        context.progress,
      )
    : null;
  return ok({
    answer: first.value,
    text: firstAnswerText(first.value, note ?? PARTIAL_LINE),
  });
}

/** Bare `prism`: index and answer, install nothing. */
export const firstRunCommand: CommandHandler = async (context) => {
  const result = await answerWithMap(context);
  if (!result.ok) return result;
  return ok({ data: result.value.answer, human: () => result.value.text });
};

export const startCommand: CommandHandler = async (context) => {
  const hosts = detectHosts(homedir());
  const lines: string[] = [];
  let installed: readonly string[] = [];
  if (hosts.length === 0) {
    lines.push(
      "No coding agent found (Claude Code, Cursor, Codex, opencode). Indexing anyway; run `prism install <client>` once one is set up.",
    );
  } else {
    const layout = defaultLayout();
    if (typeof layout === "string")
      return err(prismError(PrismErrorCode.NOT_FOUND, layout));
    context.progress(
      `Installing for ${hosts.map((host) => HOST_NAMES[host]).join(", ")}…`,
    );
    const result = await runInstall({
      hosts,
      scope: "user",
      root: context.workspace.path,
      layout,
      env: process.env,
    });
    if (result.kind === "permission")
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Cannot write ${result.wipe.path}; nothing was changed. Fix: ${result.wipe.fix}`,
        ),
      );
    installed = result.installed;
    if (result.wipe.kind === "wiped") lines.push(result.wipe.line);
    lines.push(
      `Prism ${result.record.version} installed for ${result.installed.map((host) => HOST_NAMES[host]).join(", ")} (${result.build}).`,
      ...result.notes,
      ...backupLines(result.backupRoot),
    );
  }
  const result = await answerWithMap(context);
  if (!result.ok) return result;
  return ok({
    data: { installed, ...result.value.answer },
    human: ({ width }) =>
      [...lines.flatMap((line) => wrap(line, width)), result.value.text].join(
        "\n",
      ),
  });
};
