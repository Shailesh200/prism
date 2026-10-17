/**
 * The one consent step (Shailesh, Atlas, Arc): nothing writes to a user's
 * agent config without asking. `prism start`, `prism doctor --fix` and
 * `prism upgrade` call `confirmAndWrite`; there is no second copy of the
 * list, the question, the refusals or the backup.
 *
 * - `--dry-run`: the list only, nothing written.
 * - `--yes`: the list is printed, no question.
 * - `--json` without `--yes`: refused (`PRISM_YES_REQUIRED`, plan in
 *   `error.details.plan`), exit 1, never a prompt.
 * - No TTY without `--yes`: refused on stderr, exit 1.
 * - Otherwise the y/N question; anything but y/yes is no.
 *
 * `prism start`, `prism doctor --fix` and `prism upgrade` call it.
 * `prism install <agent>` asks nothing (running it is the ask, Arc) but
 * takes the same backup first (`backUpFirst`).
 *
 * After a yes, one backup folder is reserved for the run (never an existing
 * one), every existing file in the plan is copied into it, and only then is
 * `write` called. `write` gets the folder, so the 1.x move shares it.
 */
import { createInterface } from "node:readline";
import {
  err,
  ok,
  PrismErrorCode,
  prismError,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import type { CommandContext, CommandOutcome } from "../runtime.js";
import { backupConfigs, reserveBackupDir, tilde } from "./backups.js";
import {
  CONSENT_COPY,
  commandCopy,
  fileList,
  wipeBlock,
  type ConsentCommand,
} from "./consent-copy.js";
import type { StartPlan } from "./start-plan.js";

/** The terminal side of the question; tests pass stand-ins. */
export type ConsentIo = {
  readonly isTty: () => boolean;
  /** Print `question`, read one line. */
  readonly ask: (question: string) => Promise<string>;
};

/**
 * Print `question`, read one line. The answer is resolved before the prompt
 * is closed: `close` fires synchronously and its handler resolves with ""
 * (Scout QA: closing first turned every `y` into "no").
 */
export function askLine(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  const rl = createInterface({ input, output });
  return new Promise((done) => {
    rl.question(question, (line) => {
      done(line);
      rl.close();
    });
    rl.once("close", () => done(""));
  });
}

export const defaultConsentIo: ConsentIo = {
  isTty: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask: (question) => askLine(question),
};

/** y or yes (any case); everything else, Enter included, is no. */
export function saidYes(line: string): boolean {
  return /^\s*y(es)?\s*$/i.test(line);
}

/** The list shared by the question, `--yes` and `--dry-run`. */
export function listLines(plan: StartPlan, home: string): string[] {
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

/** Writes go through a symlink to its target, so the backup line names it. */
function linkLines(plan: StartPlan): string[] {
  const targets = plan.rows.flatMap((row) => (row.linkTo ? [row.linkTo] : []));
  return targets.length > 0 ? [CONSENT_COPY.symlinkBackup(targets)] : [];
}

/**
 * The one JSON shape of the planned changes, the same for `--json --dry-run`
 * (`data.plan`), `--json` without `--yes` (`error.details.plan`) and
 * `--json --yes` (`data.plan`).
 */
export function planJson(
  plan: StartPlan,
  names: readonly string[],
): {
  readonly hosts: readonly string[];
  readonly writes: readonly {
    readonly agent: string;
    readonly path: string;
    readonly kind: "file" | "dir";
    readonly exists: boolean;
    readonly role: string;
    readonly linkTo?: string;
  }[];
  readonly wipe: StartPlan["wipe"];
  readonly backupDir: string;
  readonly nothingToDo: boolean;
} {
  return {
    hosts: [...names],
    writes: plan.writes.map((write, i) => ({
      agent: write.agent,
      path: write.path,
      kind: write.kind,
      exists: write.exists,
      role: plan.rows[i]?.role ?? "file",
      ...(write.linkTo ? { linkTo: write.linkTo } : {}),
    })),
    wipe: plan.wipe,
    backupDir: plan.backupDir,
    nothingToDo: plan.nothingToDo,
  };
}

export type ConfirmRequest<T> = {
  readonly command: ConsentCommand;
  readonly plan: StartPlan;
  /** Agent names, for the intro line. */
  readonly names: readonly string[];
  readonly home: string;
  readonly context: CommandContext;
  readonly io: ConsentIo;
  /** The real writes. Called once, after consent and after the backup. */
  readonly write: (backupRoot: string | undefined) => Promise<T>;
};

export type Confirmed<T> =
  /** Nothing would change: nothing asked, backed up or written. */
  | { readonly kind: "nothing" }
  /** Dry run, refusal or "no": nothing written. Return `result` as is. */
  | {
      readonly kind: "stop";
      readonly result: Result<CommandOutcome, PrismError>;
    }
  | {
      readonly kind: "written";
      readonly value: T;
      /** The copies made in `<backup>/configs/`. */
      readonly backups: readonly string[];
      /** The backup folder used, as shown (`~/…/`). */
      readonly backupShown: string;
    };

const stop = (result: Result<CommandOutcome, PrismError>) =>
  ({ kind: "stop", result }) as const;

export async function confirmAndWrite<T>(
  request: ConfirmRequest<T>,
): Promise<Confirmed<T>> {
  const { plan, names, home, context, command } = request;
  if (plan.nothingToDo) return { kind: "nothing" };
  const copy = commandCopy(command);
  const summary = planJson(plan, names);
  const machine = context.output.json;
  const say = (line: string) => {
    if (!machine) context.writer.out(line);
  };

  if (context.args.flag("dryRun"))
    return stop(
      ok({
        data: { dryRun: true, plan: summary },
        human: () =>
          [
            CONSENT_COPY.dryRunHead,
            "",
            copy.dryIntro(names, plan.rows),
            ...listLines(plan, home),
            "",
            CONSENT_COPY.dryBackedUp,
            ...linkLines(plan),
            "",
            copy.dryFooter,
          ].join("\n"),
      }),
    );

  if (context.options.yes) {
    // The list still prints, so script logs show what changed.
    say(copy.yesIntro(names, plan.rows));
    for (const line of listLines(plan, home)) say(line);
  } else if (machine) {
    // `--json` without `--yes` (Atlas): never a prompt, nothing changes.
    return stop(
      err(
        prismError(PrismErrorCode.YES_REQUIRED, CONSENT_COPY.jsonYesRequired, {
          plan: summary,
        }),
      ),
    );
  } else if (!request.io.isTty()) {
    // Nobody to ask: nothing changes; stderr, exit 1.
    return stop(
      ok({
        data: { changed: false, reason: "no_tty", plan: summary },
        human: () => copy.noTty.join("\n"),
        findings: true,
        stderr: true,
      }),
    );
  } else {
    say(copy.intro(names, plan.rows));
    if (!copy.introIsHeader) {
      say("");
      if (plan.rows.length > 0) say(CONSENT_COPY.willWrite);
    }
    for (const line of listLines(plan, home)) say(line);
    say("");
    say(CONSENT_COPY.backedUpFirst(`${tilde(plan.backupDir, home)}/`));
    for (const line of linkLines(plan)) say(line);
    say(CONSENT_COPY.staysLocal);
    say("");
    if (!saidYes(await request.io.ask(CONSENT_COPY.prompt)))
      return stop(
        ok({
          data: { changed: false, reason: "declined", plan: summary },
          human: () => copy.declined.join("\n"),
        }),
      );
  }

  const { backupRoot, backups, backupShown } = backUpFirst(plan, home, say);
  const value = await request.write(backupRoot);
  return { kind: "written", value, backups, backupShown };
}

export type BackedUp = {
  /** The folder reserved for this run; absent when nothing needed one. */
  readonly backupRoot: string | undefined;
  /** The copies made in `<backup>/configs/`. */
  readonly backups: readonly string[];
  /** The backup folder, as shown (`~/…/`). */
  readonly backupShown: string;
};

/**
 * The backup step, shared by `confirmAndWrite` and `prism install` (which
 * needs no question: running it is the ask, Arc). One backup folder per run,
 * never an existing one (Arc review): `-2`… when the stamp is taken. Every
 * existing file in the plan is copied into it before anything is written.
 */
export function backUpFirst(
  plan: StartPlan,
  home: string,
  say: (line: string) => void,
): BackedUp {
  const backupRoot =
    plan.toBackUp.length > 0 || plan.wipe
      ? reserveBackupDir(plan.backupDir)
      : undefined;
  const backupShown = `${tilde(backupRoot ?? plan.backupDir, home)}/`;
  let backups: string[] = [];
  if (backupRoot && plan.toBackUp.length > 0) {
    say(CONSENT_COPY.backingUp(plan.toBackUp.length, backupShown));
    for (const line of linkLines(plan)) say(line);
    backups = backupConfigs(backupRoot, plan.toBackUp, home);
  }
  return { backupRoot, backups, backupShown };
}
