/**
 * `prism doctor` (M-028) — can Prism work here, and on what?
 *
 * The most useful thing it prints is *which* workspace was chosen and why.
 * Git-root discovery is helpful right up until it surprises someone, and the
 * cure for that surprise is showing the decision rather than hiding it.
 */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "@repo-prism/core";
import {
  err,
  ok,
  prismError,
  PrismErrorCode,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { workspaceCacheDir } from "@repo-prism/shared/prism-home";
import {
  readInstallRecord,
  type InstallRecord,
} from "@repo-prism/shared/prism-bin";
import { habitsDir, readHabits } from "@repo-prism/shared/habits";
import { resolveStrength } from "@repo-prism/shared/user-config";
import { stopDaemon } from "@repo-prism/daemon";
import { INSTALL_HOSTS, type InstallHost } from "../install/hosts.js";
import { hookConfigChecks } from "../install/hook-health.js";
import {
  confirmAndWrite,
  defaultConsentIo,
  type ConsentIo,
} from "../install/confirm-write.js";
import { planStart } from "../install/start-plan.js";
import {
  defaultLayout,
  enableReceipt,
  HOST_NAMES,
  RECEIPT_HOSTS,
  runInstall,
  sourceLayout,
  type SourceLayout,
} from "./install.js";
import { paint, renderFields, renderHeading, type Style } from "../output.js";
import {
  isPrismSourceRepo,
  scanSurfaces,
  surfaceProblems,
} from "./surfaces.js";
import { wrap } from "../table.js";
import { checkSkills } from "./doctor-skills.js";
import type {
  CommandContext,
  CommandHandler,
  CommandOutcome,
} from "../runtime.js";

/** Detect a shallow clone (M-057 P-B11). Exported for unit tests. */
export function isShallowGitRepository(rootPath: string): boolean | null {
  try {
    const out = execFileSync(
      "git",
      ["-C", rootPath, "rev-parse", "--is-shallow-repository"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out === "true") return true;
    if (out === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/** Habit skills (plan P15): readable, with the old store migrated. */
export async function habitsChecks(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Check[]> {
  const file = await readHabits(env);
  if (!file.ok) {
    return [{ label: "Habits", status: "fail", detail: file.error.message }];
  }
  const count = file.value.habits.length;
  if (count === 0) return [];
  return [
    {
      label: "Habits",
      status: "ok",
      detail: `${count} habit${count === 1 ? "" : "s"} in ${habitsDir(env)}`,
    },
  ];
}

type Check = {
  readonly label: string;
  readonly status: "ok" | "warn" | "fail";
  readonly detail: string;
};

const STATUS_STYLE: Record<Check["status"], Style> = {
  ok: "green",
  warn: "yellow",
  fail: "red",
};

const STATUS_MARK: Record<Check["status"], string> = {
  ok: "ok",
  warn: "warn",
  fail: "fail",
};

/** What `prism doctor --fix` needs from the machine; tests pass stand-ins. */
export type DoctorDeps = ConsentIo & {
  readonly home: () => string;
  readonly env: () => NodeJS.ProcessEnv;
  readonly now: () => Date;
  /** The build the recorded install should point at. */
  readonly layout: (record: InstallRecord) => SourceLayout | string;
  readonly stopDaemon: (env: NodeJS.ProcessEnv) => Promise<unknown>;
};

export const defaultDoctorDeps: DoctorDeps = {
  ...defaultConsentIo,
  home: homedir,
  env: () => process.env,
  now: () => new Date(),
  layout: (record) =>
    record.source ? sourceLayout(record.source) : defaultLayout(),
  stopDaemon: (env) => stopDaemon({ env }),
};

export function makeDoctorCommand(
  deps: DoctorDeps = defaultDoctorDeps,
): CommandHandler {
  return (context) => runDoctor(context, deps);
}

export const doctorCommand: CommandHandler = makeDoctorCommand();

async function runDoctor(
  context: CommandContext,
  deps: DoctorDeps,
): Promise<Result<CommandOutcome, PrismError>> {
  const topic = context.args.positionals[0];
  if (topic !== undefined && topic !== "skills") {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Unknown topic "${topic}". Usage: prism doctor [skills]`,
      ),
    );
  }
  const checks: Check[] = [];

  checks.push({
    label: "Node",
    status: "ok",
    detail: process.version,
  });

  const workspaceExists = existsSync(context.workspace.path);
  checks.push({
    label: "Workspace",
    status: workspaceExists ? "ok" : "fail",
    detail: workspaceExists
      ? `${context.workspace.path} (from ${context.workspace.source})`
      : `${context.workspace.path} does not exist`,
  });

  const isGitRepo = existsSync(join(context.workspace.path, ".git"));
  checks.push({
    label: "Git",
    status: isGitRepo ? "ok" : "warn",
    detail: isGitRepo
      ? "repository found"
      : "no .git — history-derived signals will be unavailable",
  });

  // CI mode (M-057 P-B11): shallow clones truncate history-derived signals.
  if (context.args.flag("ci") && isGitRepo) {
    const shallow = isShallowGitRepository(context.workspace.path);
    if (shallow === true) {
      checks.push({
        label: "Shallow clone",
        status: "warn",
        detail:
          "git rev-parse --is-shallow-repository=true — history-derived signals (ownership, churn, health history) will be incomplete. Fetch with --unshallow or fetch-depth: 0 in CI.",
      });
    } else if (shallow === false) {
      checks.push({
        label: "Shallow clone",
        status: "ok",
        detail: "full history available",
      });
    }
  }

  let fixed: Check[] = [];
  if (context.args.flag("fix")) {
    const fix = await fixAgentConfigs(context, deps);
    if ("stop" in fix) return fix.stop;
    fixed = fix.checks;
  }
  checks.push(...fixed, ...installChecks());

  const cacheDir = workspaceCacheDir(context.workspace.path);
  const hasCache = existsSync(cacheDir);
  checks.push({
    label: "Index cache",
    // Not a failure — every command builds the index it needs. It is still
    // worth flagging, because it is why the next command will be the slow one.
    status: hasCache ? "ok" : "warn",
    detail: hasCache
      ? cacheDir
      : "none yet — the next command that needs it will build one, or run `prism index` now",
  });

  // Only touch the index when the workspace is real; opening a missing path
  // would turn a diagnostic into a failure.
  let freshness: string = "not checked";
  if (workspaceExists && hasCache) {
    const opened = await context.open();
    if (opened.ok) {
      const state = opened.value.getIndexFreshness();
      freshness = state.ok
        ? `${state.value.status}${
            state.value.pendingDirtyCount > 0
              ? ` (${state.value.pendingDirtyCount} pending)`
              : ""
          }${state.value.lastError ? ` — last error: ${state.value.lastError}` : ""}`
        : state.error.message;
      checks.push({
        label: "Index",
        // A knowingly-behind index is a warning, not a pass: the numbers a
        // later command prints would be stale without saying so.
        status: state.ok && state.value.lastError === undefined ? "ok" : "warn",
        detail: freshness,
      });
    } else {
      checks.push({
        label: "Index",
        status: "fail",
        detail: opened.error.message,
      });
    }
  }

  const strength = resolveStrength(context.workspace.path);
  checks.push(
    strength.ok
      ? {
          label: "Strength",
          status: "ok",
          detail: `${strength.value.strength} (${strength.value.source}); change with \`prism strength\``,
        }
      : { label: "Strength", status: "fail", detail: strength.error.message },
  );
  checks.push(...(await habitsChecks()));

  if (context.args.positionals[0] === "skills") {
    const skills = checkSkills(context.workspace.path);
    if (skills.length === 0) {
      checks.push({
        label: "Skills",
        status: "ok",
        detail: "no user skill names a Prism tool",
      });
    }
    for (const skill of skills) {
      checks.push({
        label: "Skill",
        status: skill.status,
        detail:
          skill.status === "ok"
            ? `${skill.file}: ${skill.tools.join(", ")} registered`
            : `${skill.file}: ${skill.problems.join("; ")}`,
      });
    }
  }

  if (context.args.flag("surfaces")) {
    const hits = scanSurfaces();
    const problems = surfaceProblems(
      hits,
      isPrismSourceRepo(context.workspace.path),
    );
    if (hits.length === 0) {
      checks.push({
        label: "Surfaces",
        status: "warn",
        detail: "no Prism server, hook, or extension found in the home configs",
      });
    }
    for (const hit of hits) {
      const problem = problems.some((line) => line.includes(hit.where));
      checks.push({
        label: hit.host,
        status: problem ? "fail" : "ok",
        detail: `${hit.kind} — ${hit.detail}`,
      });
    }
    for (const problem of problems) {
      if (checks.some((check) => check.detail.includes(problem))) continue;
      checks.push({ label: "Surfaces", status: "fail", detail: problem });
    }
  }

  const failed = checks.some((check) => check.status === "fail");

  return ok({
    data: {
      core: { version: PRISM_CORE_VERSION, apiLevel: PRISM_API_LEVEL },
      node: process.version,
      workspace: {
        path: context.workspace.path,
        source: context.workspace.source,
      },
      checks,
    },
    findings: failed,
    human({ color, width }) {
      const lines = [
        renderHeading("Prism doctor", color),
        "",
        renderFields(
          [
            ["Core", `${PRISM_CORE_VERSION} (API level ${PRISM_API_LEVEL})`],
            ["Node", process.version],
            ["Workspace", context.workspace.path],
            ["Chosen via", context.workspace.source],
          ],
          color,
          width,
        ),
        "",
      ];

      for (const check of checks) {
        const mark = paint(
          STATUS_MARK[check.status].padEnd(4),
          STATUS_STYLE[check.status],
          color,
        );
        const label = check.label.padEnd(12);
        const indent = " ".repeat(5 + label.length);
        const [first = "", ...rest] = wrap(check.detail, width - indent.length);
        lines.push(
          `${mark} ${label} ${first}`,
          ...rest.map((line) => `${indent}${line}`),
        );
      }

      return lines.join("\n");
    },
  });
}

/** Launches of anything but the local build: npx, or an npm install. */
const published = () =>
  scanSurfaces().filter(
    (hit) => hit.kind === "published-npm" || hit.kind === "npm-install",
  );

/**
 * `--fix`: bring the recorded agents' Prism setup in line with the installed version
 * (server path, hooks, rule, skills) by re-running their install, through
 * the same consent step as `prism start` (`confirmAndWrite`): the list, a
 * y/N (or `--yes`), a backup, then the writes. Nothing to change: no
 * question. The daemon is stopped only once the fix goes ahead, so the next
 * client starts the current build.
 */
export async function fixAgentConfigs(
  context: CommandContext,
  deps: DoctorDeps,
): Promise<
  | { readonly stop: Result<CommandOutcome, PrismError> }
  | { readonly checks: Check[] }
> {
  const env = deps.env();
  const read = readInstallRecord(env);
  // Not installed or unreadable: `installChecks` says what to run.
  if (read.kind !== "ok") return { checks: [] };
  const record: InstallRecord = read.record;
  const layout = deps.layout(record);
  if (typeof layout === "string")
    return {
      checks: [
        {
          label: "Fix",
          status: "fail",
          detail: `cannot rewrite configs: ${layout}`,
        },
      ],
    };
  const hosts = record.hosts.filter((host): host is InstallHost =>
    (INSTALL_HOSTS as readonly string[]).includes(host),
  );
  const home = deps.home();
  const now = deps.now();
  const scope = record.scope ?? "user";
  const root = record.root ?? context.cwd;
  const names = hosts.map((host) => HOST_NAMES[host]);
  const plan = planStart({
    hosts,
    hostNames: HOST_NAMES,
    scope,
    home,
    root,
    node: process.execPath,
    bin: layout.bin,
    pack: layout.pack,
    env,
    now,
    receiptHosts: RECEIPT_HOSTS,
    enableReceipt,
  });
  const confirmed = await confirmAndWrite({
    command: "prism doctor --fix",
    plan,
    names,
    home,
    context,
    io: deps,
    write: (backupRoot) =>
      runInstall({
        hosts,
        scope,
        root,
        layout,
        env,
        now,
        home,
        ...(backupRoot ? { backupRoot } : {}),
      }),
  });
  if (confirmed.kind === "stop") return { stop: confirmed.result };
  await deps.stopDaemon(env);
  const checks: Check[] = [
    {
      label: "Daemon",
      status: "ok",
      detail: "stopped; the next client starts the current build",
    },
  ];
  if (confirmed.kind === "nothing") {
    checks.push({
      label: "Fix",
      status: "ok",
      detail: `${names.join(", ")} already match the installed version; nothing to change`,
    });
    return { checks };
  }
  const result = confirmed.value;
  checks.push(
    result.kind === "permission"
      ? {
          label: "Fix",
          status: "fail",
          detail: `Cannot write ${result.wipe.path}; nothing was changed. Fix: ${result.wipe.fix}`,
        }
      : {
          label: "Fix",
          status: "ok",
          detail: `rewrote ${names.join(", ")} to ${layout.source ? "the local build" : "the installed server"} ${layout.bin}${confirmed.backups.length > 0 ? `; backups in ${confirmed.backupShown}` : ""}`,
        },
  );
  return { checks };
}

/**
 * The install record, the bin it names, and (for a local build) the
 * `no-published-refs` check over every editor config (§3.0, DEV-1), plus
 * the hook configs (detection only; `--fix` updates them).
 */
function installChecks(): Check[] {
  const read = readInstallRecord(process.env);
  if (read.kind !== "ok")
    return [
      {
        label: "Install",
        status: "warn",
        detail:
          read.kind === "invalid"
            ? `install.json is invalid (${read.reason}). Run \`prism install <editor> --local <checkout>\`.`
            : "not installed. Run `prism install <editor> --local <checkout>`.",
      },
    ];
  const current = read.record;
  const checks: Check[] = [
    {
      label: "Install",
      status: existsSync(current.bin) ? "ok" : "fail",
      detail: existsSync(current.bin)
        ? `${current.version} for ${current.hosts.join(", ")}; server ${current.bin}`
        : `server ${current.bin} is missing. Fix: prism doctor --fix, or prism install <editor> --local <checkout>.`,
    },
  ];
  if (current.source) {
    const hits = published();
    checks.push(
      hits.length === 0
        ? {
            label: "Published",
            status: "ok",
            detail: "no published package referenced (local build only)",
          }
        : {
            label: "Published",
            status: "fail",
            detail: `published package referenced during development: ${hits
              .map((hit) => `${hit.host} (${hit.where})`)
              .join(", ")}. Fix: prism doctor --fix.`,
          },
    );
  }
  // Round 4: hook configs an older release wrote (`--fix` updates them).
  checks.push(...hookConfigChecks(current));
  return checks;
}
