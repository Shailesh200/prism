/**
 * `prism start` (plan P19): from nothing to a first answer in one command.
 * Detects the coding agents on this machine, installs Prism for each from
 * this local build, indexes the repository and prints the top of the repo
 * map with what to try next. A bare `prism` prints the same answer without
 * installing anything.
 *
 * Consent (round 5, release blocker): the list, the y/N question, the
 * refusals and the backup are `confirmAndWrite` (install/confirm-write.ts),
 * shared with `prism doctor --fix`. Nothing to change: no question, no
 * backup, no writes. Wording lives in `install/consent-copy.ts` (Muse's copy).
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

export { saidYes } from "../install/confirm-write.js";
/** The plan's JSON shape; one function, shared with `prism doctor --fix`. */
export const startPlanJson = planJson;
import { CONSENT_COPY, installedLines } from "../install/consent-copy.js";
import {
  confirmAndWrite,
  defaultConsentIo,
  planJson,
  type ConsentIo,
} from "../install/confirm-write.js";
import { detectHosts, type InstallHost } from "../install/hosts.js";
import { planStart } from "../install/start-plan.js";
import type { CommandContext, CommandHandler } from "../runtime.js";
import { wrap } from "../table.js";
import {
  defaultLayout,
  enableReceipt,
  HOST_NAMES,
  RECEIPT_HOSTS,
  runInstall,
  type SourceLayout,
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
  'Try: prism prepare "<task>", or ask your agent for a change in plain words.';

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

/** What `prism start` needs from the machine; tests pass stand-ins. */
export type StartDeps = ConsentIo & {
  readonly home: () => string;
  readonly env: () => NodeJS.ProcessEnv;
  readonly now: () => Date;
  readonly layout: () => SourceLayout | string;
  readonly install: typeof runInstall;
  readonly answer: (
    context: CommandContext,
  ) => Promise<Result<{ answer: FirstAnswer; text: string }, PrismError>>;
};

export const defaultStartDeps: StartDeps = {
  ...defaultConsentIo,
  home: homedir,
  env: () => process.env,
  now: () => new Date(),
  layout: defaultLayout,
  install: runInstall,
  answer: answerWithMap,
};

/** `prism start`, with the machine (home, TTY, prompt, install) injectable. */
export function makeStartCommand(
  deps: StartDeps = defaultStartDeps,
): CommandHandler {
  return async (context) => {
    const home = deps.home();
    const env = deps.env();
    const hosts: InstallHost[] = detectHosts(home);
    const say = (line: string) => {
      if (!context.output.json) context.writer.out(line);
    };
    if (hosts.length === 0) {
      const result = await deps.answer(context);
      if (!result.ok) return result;
      return ok({
        data: { installed: [], ...result.value.answer },
        human: ({ width }) =>
          [...wrap(CONSENT_COPY.noHosts, width), result.value.text].join("\n"),
      });
    }
    const layout = deps.layout();
    if (typeof layout === "string")
      return err(prismError(PrismErrorCode.NOT_FOUND, layout));
    const names = hosts.map((host) => HOST_NAMES[host]);
    const now = deps.now();
    const plan = planStart({
      hosts,
      hostNames: HOST_NAMES,
      scope: "user",
      home,
      root: context.workspace.path,
      node: process.execPath,
      bin: layout.bin,
      pack: layout.pack,
      env,
      now,
      receiptHosts: RECEIPT_HOSTS,
      enableReceipt,
    });
    const summary = planJson(plan, names);

    // The list, the question (or a refusal), the backup, then the install.
    const confirmed = await confirmAndWrite({
      command: "prism start",
      plan,
      names,
      home,
      context,
      io: deps,
      write: (backupRoot) => {
        context.progress(`Installing for ${names.join(", ")}…`);
        return deps.install({
          hosts,
          scope: "user",
          root: context.workspace.path,
          layout,
          env,
          now,
          home,
          ...(backupRoot ? { backupRoot } : {}),
        });
      },
    });
    if (confirmed.kind === "stop") return confirmed.result;
    // Case 7: nothing would change. No question, no backup, no writes.
    if (confirmed.kind === "nothing") {
      const result = await deps.answer(context);
      if (!result.ok) return result;
      return ok({
        data: {
          installed: [],
          alreadySetUp: true,
          plan: summary,
          ...result.value.answer,
        },
        human: ({ width }) =>
          [
            ...wrap(CONSENT_COPY.alreadySetUp(layout.version, names), width),
            result.value.text,
          ].join("\n"),
      });
    }

    const { value: result, backups, backupShown } = confirmed;
    if (result.kind === "permission")
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Cannot write ${result.wipe.path}; nothing was changed. Fix: ${result.wipe.fix}`,
        ),
      );
    const moved = result.wipe.kind === "wiped";
    const status = [
      ...(moved ? [result.wipe.line] : []),
      ...installedLines(result.installed.map((host) => HOST_NAMES[host])),
      ...(backups.length > 0 || moved
        ? [CONSENT_COPY.backupsAre(backupShown)]
        : []),
      CONSENT_COPY.uninstallHint,
      ...result.notes,
    ];
    for (const line of status)
      for (const part of wrap(line, context.output.width)) say(part);
    const answered = await deps.answer(context);
    if (!answered.ok) return answered;
    return ok({
      data: {
        installed: result.installed,
        plan: summary,
        backups,
        ...(moved ? { movedTo: result.wipe.backupDir } : {}),
        ...answered.value.answer,
      },
      human: () => answered.value.text,
    });
  };
}

export const startCommand: CommandHandler = makeStartCommand();
