/**
 * `prism start` (plan P19): from nothing to a first answer in one command.
 * Detects the coding agents on this machine, installs Prism for each from
 * this local build, indexes the repository and prints the top of the repo
 * map with what to try next. A bare `prism` prints the same answer without
 * installing anything.
 *
 * Consent (round 5, release blocker): before writing, it lists the config
 * files whose content would change and any 1.x data it would move, and asks
 * y/N. `--yes` skips the question, `--dry-run` only shows the list. No TTY
 * and no `--yes`: nothing changes, exit 1. Each existing file is copied to
 * `~/.prism-backups/<stamp>/configs/` first and 1.x data moves to
 * `.../<stamp>/1x/`. Nothing to change: no question, no backup, no writes.
 * Wording lives in `install/consent-copy.ts` (Muse's copy).
 *
 * Large repos answer from a partial (package-first) index; the daemon finishes
 * the full index in the background.
 */
import { createInterface } from "node:readline";
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
import { backupConfigs, tilde } from "../install/backups.js";
import { CONSENT_COPY, fileList, wipeBlock } from "../install/consent-copy.js";
import { detectHosts, type InstallHost } from "../install/hosts.js";
import { planStart, type StartPlan } from "../install/start-plan.js";
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
export type StartDeps = {
  readonly home: () => string;
  readonly env: () => NodeJS.ProcessEnv;
  readonly now: () => Date;
  readonly isTty: () => boolean;
  /** Print `question`, read one line. */
  readonly ask: (question: string) => Promise<string>;
  readonly layout: () => SourceLayout | string;
  readonly install: typeof runInstall;
  readonly answer: (
    context: CommandContext,
  ) => Promise<Result<{ answer: FirstAnswer; text: string }, PrismError>>;
};

function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    rl.question(question, (line) => {
      rl.close();
      done(line);
    });
    rl.once("close", () => done(""));
  });
}

export const defaultStartDeps: StartDeps = {
  home: homedir,
  env: () => process.env,
  now: () => new Date(),
  isTty: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask: askLine,
  layout: defaultLayout,
  install: runInstall,
  answer: answerWithMap,
};

/** y or yes (any case); everything else, Enter included, is no. */
export function saidYes(line: string): boolean {
  return /^\s*y(es)?\s*$/i.test(line);
}

/** The list part shared by the question, `--yes` and `--dry-run`. */
function listLines(plan: StartPlan, home: string): string[] {
  const lines = [...fileList(plan.rows)];
  if (plan.wipe) {
    if (lines.length > 0) lines.push("");
    lines.push(
      ...wipeBlock({
        ...plan.wipe,
        home: tilde(plan.wipe.home, home),
        backupDir: `${tilde(plan.wipe.backupDir, home)}/`,
      }),
    );
  }
  return lines;
}

/** `prism start`, with the machine (home, TTY, prompt, install) injectable. */
export function makeStartCommand(
  deps: StartDeps = defaultStartDeps,
): CommandHandler {
  return async (context) => {
    const home = deps.home();
    const env = deps.env();
    const hosts: InstallHost[] = detectHosts(home);
    const machine = context.output.json;
    const say = (line: string) => {
      if (!machine) context.writer.out(line);
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
    const summary = {
      writes: plan.writes.map(({ path, kind, exists }) => ({
        path,
        kind,
        exists,
      })),
      wipe: plan.wipe,
      backupDir: plan.backupDir,
    };
    const backupShown = `${tilde(plan.backupDir, home)}/`;

    // Case 7: nothing would change. No question, no backup, no writes.
    if (plan.nothingToDo) {
      const result = await deps.answer(context);
      if (!result.ok) return result;
      return ok({
        data: { installed: [], alreadySetUp: true, ...result.value.answer },
        human: ({ width }) =>
          [
            ...wrap(CONSENT_COPY.alreadySetUp(layout.version, names), width),
            result.value.text,
          ].join("\n"),
      });
    }

    // Case 4: list only.
    if (context.args.flag("dryRun")) {
      return ok({
        data: { dryRun: true, plan: summary },
        human: () =>
          [
            CONSENT_COPY.dryRunHead,
            "",
            CONSENT_COPY.dryIntro(names),
            ...listLines(plan, home),
            "",
            CONSENT_COPY.dryBackedUp,
            "",
            CONSENT_COPY.dryFooter,
          ].join("\n"),
      });
    }

    if (context.options.yes) {
      // Case 5: the list still prints, so script logs show what changed.
      say(CONSENT_COPY.yesIntro(names));
      for (const line of listLines(plan, home)) say(line);
    } else if (!deps.isTty() || machine) {
      // Case 6: nobody to ask. Nothing changes; stderr, exit 1.
      return ok({
        data: { changed: false, reason: "no_tty", plan: summary },
        human: () => CONSENT_COPY.noTty.join("\n"),
        findings: true,
        stderr: true,
      });
    } else {
      // Case 1: the question.
      say(CONSENT_COPY.intro(names));
      say("");
      if (plan.rows.length > 0) say(CONSENT_COPY.willWrite);
      for (const line of listLines(plan, home)) say(line);
      say("");
      say(CONSENT_COPY.backedUpFirst(backupShown));
      say(CONSENT_COPY.staysLocal);
      say("");
      if (!saidYes(await deps.ask(CONSENT_COPY.prompt))) {
        // Case 2: no. Exit 0.
        return ok({
          data: { changed: false, reason: "declined", plan: summary },
          human: () => CONSENT_COPY.declined.join("\n"),
        });
      }
    }

    // Case 3 / 5 / 8: back up, install, then index.
    let backups: string[] = [];
    if (plan.toBackUp.length > 0) {
      say(CONSENT_COPY.backingUp(plan.toBackUp.length, backupShown));
      backups = backupConfigs(plan.backupDir, plan.toBackUp, home);
    }
    context.progress(`Installing for ${names.join(", ")}…`);
    const result = await deps.install({
      hosts,
      scope: "user",
      root: context.workspace.path,
      layout,
      env,
      now,
      home,
    });
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
      `Prism ${result.record.version} installed for ${result.installed.map((host) => HOST_NAMES[host]).join(", ")} (${result.build}).`,
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
        backups,
        ...(moved ? { movedTo: result.wipe.backupDir } : {}),
        ...answered.value.answer,
      },
      human: () => answered.value.text,
    });
  };
}

export const startCommand: CommandHandler = makeStartCommand();
